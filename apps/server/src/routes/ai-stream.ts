// AI 流式输出 SSE 端点 + 后台继续（断线重连）
import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { aiConfigs, aiUsageLogs } from '../db/schema';
import { verifyToken } from '../services/auth/utils';
import { decryptApiKey } from '../services/ai-gateway/crypto';
import { createAdapter } from '@story-edit/ai-adapters';
import type { AIMessage } from '@story-edit/ai-adapters';
import {
  createJob,
  getJobMeta,
  completeJob,
  failJob,
  appendEvent,
  getEvents,
  subscribeToJob,
  isRedisAvailable,
} from '../services/ai-job/manager';
import type { StreamEvent } from '../services/ai-job/types';

interface StreamBody {
  configId: string;
  messages: AIMessage[];
  projectId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface ReconnectParams {
  jobId: string;
}

export async function registerAiStreamRoute(app: FastifyInstance) {
  // ================================================================
  // POST /api/ai/stream — 主 SSE 流式端点（含后台任务追踪）
  // ================================================================
  app.post<{ Body: StreamBody }>('/api/ai/stream', async (request, reply) => {
    let jobId = '';
    try {
      // 鉴权
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: '未登录' });
      }
      const payload = verifyToken(authHeader.slice(7));
      if (!payload) {
        return reply.status(401).send({ error: 'Token 无效' });
      }

      const { configId, messages, projectId, model, temperature, maxTokens } = request.body;
      if (!configId || !messages?.length) {
        return reply.status(400).send({ error: '缺少 configId 或 messages' });
      }

      // 查找 AI 配置
      const [config] = await db.select().from(aiConfigs).where(
        and(eq(aiConfigs.id, configId), eq(aiConfigs.userId, payload.userId)),
      );
      if (!config) {
        return reply.status(404).send({ error: 'AI 配置不存在' });
      }

      // 创建后台任务（Redis 可用时）
      if (isRedisAvailable()) {
        jobId = await createJob(payload.userId, projectId);
      }

      // 创建适配器
      const apiKey = decryptApiKey(config.apiKey);
      app.log.info({ provider: config.provider, baseUrl: config.baseUrl, model: config.defaultModel, jobId }, 'AI stream request');
      const adapter = createAdapter(config.provider, {
        apiKey,
        baseUrl: config.baseUrl || undefined,
        defaultModel: config.defaultModel || undefined,
      });

      // SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': request.headers.origin || '*',
        'Access-Control-Allow-Credentials': 'true',
      });

      // 首条事件：告知 jobId（用于断线重连）
      if (jobId) {
        reply.raw.write(`data: ${JSON.stringify({ jobId })}\n\n`);
      }

      // 心跳机制：每 5s 发送一次 SSE comment
      const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 5000);

      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;

      try {
        const stream = adapter.chatStream(messages, { model, temperature, maxTokens });

        for await (const chunk of stream) {
          if (chunk.done) {
            if (chunk.usage) {
              totalPromptTokens = chunk.usage.promptTokens;
              totalCompletionTokens = chunk.usage.completionTokens;
            }
            const event: StreamEvent = { done: true, usage: chunk.usage };
            reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
            if (jobId) appendEvent(jobId, event).catch(() => {});
          } else {
            const event: StreamEvent & { thinking?: string } = { content: chunk.content };
            if (chunk.thinking) event.thinking = chunk.thinking;
            reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
            if (jobId) appendEvent(jobId, event).catch(() => {});
          }
        }
      } catch (err: unknown) {
        app.log.error({ err }, 'Stream error');
        const msg = err instanceof Error ? err.message : 'AI 调用失败';
        const errorEvent: StreamEvent = { error: msg };
        reply.raw.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
        if (jobId) {
          appendEvent(jobId, errorEvent).catch(() => {});
          failJob(jobId, msg).catch(() => {});
        }
      } finally {
        clearInterval(heartbeat);
      }

      // 标记任务完成
      if (jobId) {
        completeJob(jobId).catch(() => {});
      }

      // 记录用量
      if (totalPromptTokens > 0 || totalCompletionTokens > 0) {
        await db.insert(aiUsageLogs).values({
          userId: payload.userId,
          projectId: projectId || null,
          provider: config.provider,
          model: model || config.defaultModel || 'unknown',
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
        }).catch(() => {});
      }

      reply.raw.end();
    } catch (err: unknown) {
      app.log.error({ err }, 'Route handler error');
      const msg = err instanceof Error ? err.message : '内部错误';
      return reply.status(500).send({ error: msg });
    }
  });

  // ================================================================
  // GET /api/ai/stream/status/:jobId — 查询任务状态
  // ================================================================
  app.get<{ Params: ReconnectParams }>('/api/ai/stream/status/:jobId', async (request, reply) => {
    try {
      const meta = await getJobMeta(request.params.jobId);
      if (!meta) {
        return reply.status(404).send({ error: '任务不存在或已过期' });
      }
      return reply.send({
        jobId: meta.jobId,
        status: meta.status,
        createdAt: meta.createdAt,
        error: meta.error,
      });
    } catch (err: unknown) {
      app.log.error({ err }, 'Status check error');
      return reply.status(500).send({ error: '状态查询失败' });
    }
  });

  // ================================================================
  // GET /api/ai/stream/reconnect/:jobId — 断线重连 SSE
  // ================================================================
  app.get<{ Params: ReconnectParams }>('/api/ai/stream/reconnect/:jobId', async (request, reply) => {
    const { jobId } = request.params;
    try {
      const meta = await getJobMeta(jobId);
      if (!meta) {
        return reply.status(404).send({ error: '任务不存在或已过期' });
      }

      // SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': request.headers.origin || '*',
        'Access-Control-Allow-Credentials': 'true',
      });

      // 1. 先回放已存储的事件
      const pastEvents = await getEvents(jobId);
      for (const event of pastEvents) {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      // 2. 如果任务仍在运行，订阅新事件
      if (meta.status === 'running') {
        reply.raw.write(`data: ${JSON.stringify({ jobId, reconnecting: true })}\n\n`);

        const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 5000);

        const unsubscribe = await subscribeToJob(jobId, (event: StreamEvent) => {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
          // done 或 error 时结束重连
          if (event.done || event.error) {
            clearInterval(heartbeat);
            unsubscribe();
            reply.raw.end();
          }
        });

        // 客户端断开时清理
        request.raw.on('close', () => {
          clearInterval(heartbeat);
          unsubscribe();
        });
      } else {
        // 已完成或失败 — 发送结束信号
        reply.raw.write(`data: ${JSON.stringify({ done: true, replayed: true })}\n\n`);
        reply.raw.end();
      }
    } catch (err: unknown) {
      app.log.error({ err, jobId }, 'Reconnect error');
      const msg = err instanceof Error ? err.message : '重连失败';
      return reply.status(500).send({ error: msg });
    }
  });
}
