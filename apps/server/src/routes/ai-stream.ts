// AI 流式输出 SSE 端点
import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { aiConfigs, aiUsageLogs } from '../db/schema';
import { verifyToken } from '../services/auth/utils';
import { decryptApiKey } from '../services/ai-gateway/crypto';
import { createAdapter } from '@story-edit/ai-adapters';
import type { AIMessage } from '@story-edit/ai-adapters';

interface StreamBody {
  configId: string;
  messages: AIMessage[];
  projectId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export async function registerAiStreamRoute(app: FastifyInstance) {
  app.post<{ Body: StreamBody }>('/api/ai/stream', async (request, reply) => {
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

      // 创建适配器
      const apiKey = decryptApiKey(config.apiKey);
      app.log.info({ provider: config.provider, baseUrl: config.baseUrl, model: config.defaultModel }, 'AI stream request');
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
      });

      // 心跳机制：每 5s 发送一次 SSE comment，保持代理连接活跃
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
            reply.raw.write(`data: ${JSON.stringify({ done: true, usage: chunk.usage })}\n\n`);
          } else {
            const data: Record<string, unknown> = { content: chunk.content };
            if (chunk.thinking) data.thinking = chunk.thinking;
            reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
          }
        }
      } catch (err: unknown) {
        app.log.error({ err }, 'Stream error');
        const msg = err instanceof Error ? err.message : 'AI 调用失败';
        reply.raw.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      } finally {
        clearInterval(heartbeat);
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
      // 顶层错误处理 — 在 writeHead 之前捕获的错误
      app.log.error({ err }, 'Route handler error');
      const msg = err instanceof Error ? err.message : '内部错误';
      return reply.status(500).send({ error: msg });
    }
  });
}
