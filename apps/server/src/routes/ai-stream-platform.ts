// API代理转发 — 站内AI调用走平台Token渠道
import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { aiConfigs, apiChannels, users } from '../db/schema';
import { verifyToken } from '../services/auth/utils';
import { decryptApiKey } from '../services/ai-gateway/crypto';
import { createAdapter } from '@story-edit/ai-adapters';
import type { AIMessage } from '@story-edit/ai-adapters';
import {
  createJob, getJobMeta, completeJob, failJob,
  appendEvent, getEvents, subscribeToJob, isRedisAvailable,
} from '../services/ai-job/manager';
import type { StreamEvent } from '../services/ai-job/types';
import * as tokenBilling from '../services/token-relay/token-billing';
import * as channelManager from '../services/token-relay/channel-manager';
import * as pricingService from '../services/token-relay/model-pricing';
import * as consumptionTracker from '../services/token-relay/consumption-tracker';
import * as rateLimiter from '../services/token-relay/rate-limiter';
import { decryptApiKey as decryptChannelKey } from '../services/ai-gateway/crypto';

interface StreamBody {
  configId: string;
  messages: AIMessage[];
  projectId?: string;
  conversationId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface ReconnectParams {
  jobId: string;
}

/**
 * 使用平台Token渠道的AI流式调用
 * 流程：验权 → 查余额 → 预扣 → 选择渠道（带请求级重试） → 转发 → 精确计费
 */
async function streamWithPlatformToken(
  userId: string,
  body: StreamBody,
  app: FastifyInstance,
  reply: any,
  request: any,
) {
  const { messages, model, temperature, maxTokens, projectId, conversationId } = body;

  if (!model) throw new Error('缺少模型参数');

  // 1. 获取模型定价
  const modelProvider = getProviderFromModel(model);
  const pricing = await pricingService.getModelPricing(modelProvider, model);
  if (!pricing) throw new Error(`模型 ${model} 暂无定价信息`);

  // 2. 确保Token账户存在
  await tokenBilling.ensureAccount(userId);

  // 2.5 速率限制
  const roleForRateLimit = await tokenBilling.getUserRole(userId);
  const userTierRL = roleForRateLimit === 'paid' || roleForRateLimit === 'admin' ? 'vip' : 'free';
  const rl = await rateLimiter.checkUserChatRate(userId, userTierRL);
  if (!rl.allowed) {
    throw new Error(`请求过于频繁，请${Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)}秒后重试`);
  }

  // 2.6 模型访问权限检查
  const modelAccess = await tokenBilling.checkModelAccess(userId, model);
  if (!modelAccess.allowed) {
    throw new Error(modelAccess.reason || '无权使用该模型');
  }

  // 2.7 每日Token限制（按角色）
  const dailyCheck = await tokenBilling.checkDailyLimit(userId, model);
  if (!dailyCheck.allowed) {
    throw new Error(`今日免费额度已用完（${dailyCheck.dailyUsed}/${dailyCheck.dailyLimit} tokens），请充值后继续使用`);
  }

  // 3. 估算费用并预扣
  const estimatedInputTokens = estimateInputTokens(messages);
  const estimatedOutputTokens = maxTokens || 4096;
  const { estimatedCost } = tokenBilling.estimateCost(
    pricing.inputPricePer1m,
    pricing.outputPricePer1m,
    estimatedInputTokens,
    estimatedOutputTokens,
  );

  // 检查余额
  const hasBalance = await tokenBilling.checkBalance(userId, estimatedCost);
  if (!hasBalance) {
    throw new Error('Token余额不足，请充值后继续使用');
  }

  // 预扣
  const preDeductResult = await tokenBilling.preDeduct(userId, estimatedCost);
  if (!preDeductResult.success) {
    throw new Error(preDeductResult.error || '余额不足');
  }

  // 4. 选择上游渠道 + 同provider内重试（取消降级机制，始终使用用户选择的模型）
  const roleForRouting = await tokenBilling.getUserRole(userId);
  const userTier = roleForRouting === 'paid' || roleForRouting === 'admin' ? 'vip' : 'free';

  const maxAttempts = 3;
  const attemptedChannelIds = new Set<string>();
  let channel = await channelManager.selectChannel(modelProvider, userTier, { excludeIds: [] });
  app.log.info(`Initial channel selected: ${channel?.name || 'none'} (provider=${modelProvider}, userTier=${userTier})`);
  let usedChannel = channel;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let streamSuccess = false;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts && !streamSuccess; attempt++) {
    if (!channel) break;
    attemptedChannelIds.add(channel.id);

    const actualProvider = channel.provider;
    const channelApiKey = decryptChannelKey(channel.apiKeyEncrypted);

    const adapter = createAdapter(actualProvider, {
      apiKey: channelApiKey,
      baseUrl: channel.baseUrl || undefined,
      defaultModel: model,
    });

    // 为每次尝试设置独立超时（150s，longcat 实测最长 148s）
    const attemptTimeoutMs = 150_000;
    const attemptController = new AbortController();
    const attemptTimeoutId = setTimeout(() => attemptController.abort(), attemptTimeoutMs);

    try {
      const stream = adapter.chatStream(messages, {
        model, temperature, maxTokens,
        signal: attemptController.signal,
      });
      const iterator = stream[Symbol.asyncIterator]();

      // 尝试获取第一个 chunk（失败则重试下一个渠道，此时 SSE 头尚未发送）
      const firstResult = await iterator.next();
      clearTimeout(attemptTimeoutId);

      // 第一个 chunk 成功 — 发送 SSE 响应头
      if (!reply.sent && !reply.raw.headersSent) {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Access-Control-Allow-Origin': request.headers.origin || '*',
          'Access-Control-Allow-Credentials': 'true',
        });
      }

      const heartbeat = setInterval(() => {
        try { reply.raw.write(': heartbeat\n\n'); } catch { /* socket closed */ }
      }, 5000);

      try {
        // 写入第一个 chunk
        writeStreamChunk(reply, firstResult);

        // 继续读取剩余 chunks
        while (true) {
          const result = await iterator.next();
          // 检查 iterator 结束 或 chunk 标记 done（真流式 SSE 的结束信号）
          if (result.done || result.value?.done) {
            const val = result.value;
            if (val?.usage) {
              totalInputTokens = val.usage.promptTokens;
              totalOutputTokens = val.usage.completionTokens;
            }
            // 写入最终 done 事件
            reply.raw.write(`data: ${JSON.stringify({ done: true, ...(val?.usage ? { usage: val.usage } : {}) })}\n\n`);
            break;
          }
          writeStreamChunk(reply, result);
        }

        streamSuccess = true;
        usedChannel = channel;

        // 调用成功：清除渠道错误状态（重置增量退避计数）
        await channelManager.clearChannelError(channel.id);
      } catch (midErr: unknown) {
        // 流中途错误 — SSE 已开始，无法切换渠道
        app.log.error({ err: midErr }, 'Mid-stream error on channel ' + channel.id);
        const msg = midErr instanceof Error ? midErr.message : 'AI 调用中断';
        try { reply.raw.write(`data: ${JSON.stringify({ error: msg })}\n\n`); } catch { /* socket closed */ }
      } finally {
        clearInterval(heartbeat);
      }

    } catch (err: unknown) {
      clearTimeout(attemptTimeoutId);
      lastError = err instanceof Error ? err : new Error('未知错误');
      app.log.error({ err }, `Channel error (attempt ${attempt + 1}/${maxAttempts}): ${channel.provider}/${channel.name}`);

      // 标记当前渠道错误（触发增量退避冷却）
      await channelManager.markChannelError(channel.id, lastError.message);

      if (attempt < maxAttempts - 1) {
        let nextChannel = await channelManager.selectChannel(modelProvider, userTier, {
          excludeIds: Array.from(attemptedChannelIds),
          allowCoolingFallback: false,
        });

        // 如果没有其他可用渠道，再允许从冷却中的候选里挑最短冷却的一个
        if (!nextChannel) {
          nextChannel = await channelManager.selectChannel(modelProvider, userTier, {
            excludeIds: Array.from(attemptedChannelIds),
            allowCoolingFallback: true,
          });
        }

        // 如果仍然没有其他渠道，最后才清除当前渠道冷却并重试同一渠道
        if (!nextChannel && channel) {
          app.log.info(`No alternate channels available for ${modelProvider}, clearing cooldown for channel ${channel.id}`);
          await channelManager.clearChannelError(channel.id);
          attemptedChannelIds.delete(channel.id);
          nextChannel = await channelManager.selectChannel(modelProvider, userTier, {
            excludeIds: Array.from(attemptedChannelIds),
            allowCoolingFallback: true,
          });
        }

        channel = nextChannel;
        if (!channel) {
          app.log.error(`No channels available after retry for ${modelProvider}, breaking retry loop`);
          break;
        }

        // 等待后重试
        await sleep(Math.min(1000 * (attempt + 1), 3000));
      }
    }
  }

  // 请求失败且 SSE 头未发送 → 抛出 JSON 错误
  const headersSent = reply.sent || reply.raw.headersSent;
  if (!streamSuccess && !headersSent) {
    await tokenBilling.refundIntent(userId, estimatedCost);
    throw lastError || new Error('暂无可用AI渠道，请稍后重试');
  }

  // 流式已开始但未成功（headers 已发送）→ 发送 SSE 错误事件
  if (!streamSuccess && headersSent) {
    await tokenBilling.refundIntent(userId, estimatedCost);
    const errMsg = lastError?.message || 'AI 调用失败，请重试';
    try { reply.raw.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`); } catch { /* socket closed */ }
  }

  // 8. 精确结算
  if (streamSuccess && (totalInputTokens > 0 || totalOutputTokens > 0)) {
    const { finalCost } = await tokenBilling.finalizeCharge(
      userId, estimatedCost,
      { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      pricing.inputPricePer1m, pricing.outputPricePer1m,
    );

    // 记录渠道消耗
    await channelManager.recordChannelUsage(usedChannel!.id, totalInputTokens + totalOutputTokens);

    // 写入消费日志
    await consumptionTracker.recordConsumption({
      userId,
      source: 'in_app',
      provider: modelProvider,
      modelId: model,
      requestType: 'chat',
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cost: finalCost,
      projectId,
      conversationId,
    });
  } else if (streamSuccess) {
    const { finalCost } = await tokenBilling.finalizeCharge(
      userId, estimatedCost,
      { inputTokens: estimatedInputTokens, outputTokens: estimatedOutputTokens },
      pricing.inputPricePer1m, pricing.outputPricePer1m,
    );

    await channelManager.recordChannelUsage(usedChannel!.id, estimatedInputTokens + estimatedOutputTokens);
    await consumptionTracker.recordConsumption({
      userId,
      source: 'in_app',
      provider: modelProvider,
      modelId: model,
      requestType: 'chat',
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      cost: finalCost,
      projectId,
      conversationId,
    });
  }

  if (!reply.sent && reply.raw.headersSent) {
    try { reply.raw.end(); } catch { /* socket already closed */ }
  }
}

/**
 * 使用用户自有API Key的AI流式调用（兼容旧模式）
 */
async function streamWithOwnKey(
  userId: string,
  body: StreamBody,
  app: FastifyInstance,
  reply: any,
) {
  const { configId, messages, model, temperature, maxTokens, projectId } = body;

  const [config] = await db.select().from(aiConfigs).where(
    and(eq(aiConfigs.id, configId), eq(aiConfigs.userId, userId)),
  );
  if (!config) throw new Error('AI 配置不存在');

  const apiKey = decryptApiKey(config.apiKey);
  const adapter = createAdapter(config.provider, {
    apiKey,
    baseUrl: config.baseUrl || undefined,
    defaultModel: config.defaultModel || undefined,
  });

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  });

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
        const event: any = { content: chunk.content };
        if (chunk.thinking) event.thinking = chunk.thinking;
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    }
  } catch (err: unknown) {
    app.log.error({ err }, 'Own key stream error');
    const msg = err instanceof Error ? err.message : 'AI 调用失败';
    reply.raw.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
  } finally {
    clearInterval(heartbeat);
  }

  reply.raw.end();
}

/**
 * POST /api/ai/stream/platform — 使用平台Token渠道的AI流式调用
 */
export async function registerPlatformAiStreamRoute(app: FastifyInstance) {
  app.post<{ Body: StreamBody }>('/api/ai/stream/platform', async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: '未登录' });
      }
      const payload = verifyToken(authHeader.slice(7));
      if (!payload) {
        return reply.status(401).send({ error: 'Token 无效' });
      }

      const body = request.body;
      if (!body.messages?.length) {
        return reply.status(400).send({ error: '缺少 messages' });
      }

      await streamWithPlatformToken(payload.userId, body, app, reply, request);
    } catch (err: unknown) {
      app.log.error({ err }, 'Platform AI stream error');
      const msg = err instanceof Error ? err.message : '内部错误';
      // Only send JSON error if neither Fastify nor raw headers have been sent
      if (!reply.sent && !reply.raw.headersSent) {
        return reply.status(400).send({ error: msg });
      }
      // Headers already sent (SSE stream started) — close the connection
      if (!reply.sent && reply.raw.headersSent) {
        try { reply.raw.end(); } catch { /* socket already closed */ }
      }
    }
  });
}

/**
 * POST /api/ai/stream/channel-test — 管理员测试渠道连通性
 */
export async function registerChannelTestRoute(app: FastifyInstance) {
  app.post<{ Body: { channelId: string; model: string } }>('/api/ai/stream/channel-test', async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: '未登录' });
      }
      const payload = verifyToken(authHeader.slice(7));
      if (!payload) {
        return reply.status(401).send({ error: 'Token 无效' });
      }

      const [user] = await db.select({ isAdmin: users.isAdmin, adminLevel: users.adminLevel })
        .from(users)
        .where(eq(users.id, payload.userId));
      if (!user?.isAdmin || user.adminLevel === null || user.adminLevel > 0) {
        return reply.status(403).send({ error: '需要最高管理员权限' });
      }

      const { channelId, model } = request.body;
      if (!channelId || !model) {
        return reply.status(400).send({ error: '缺少 channelId 或 model 参数' });
      }

      // 查询渠道
      const [ch] = await db.select().from(apiChannels).where(eq(apiChannels.id, channelId));
      if (!ch) {
        return reply.status(404).send({ error: '渠道不存在' });
      }

      const apiKey = decryptChannelKey(ch.apiKeyEncrypted);
      const adapter = createAdapter(ch.provider, {
        apiKey,
        baseUrl: ch.baseUrl || undefined,
        defaultModel: model,
      });

      const startTime = Date.now();
      const result = await adapter.testConnection();
      const elapsed = Date.now() - startTime;

      return { ok: result.ok, elapsed: `${elapsed}ms`, provider: ch.provider, model, error: result.error };
    } catch (err: unknown) {
      app.log.error({ err }, 'Channel test error');
      const msg = err instanceof Error ? err.message : '内部错误';
      return reply.status(400).send({ error: msg });
    }
  });
}

// ========== Helpers ==========

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** 写入单个流式chunk到SSE响应 */
function writeStreamChunk(reply: any, result: IteratorResult<any>): void {
  if (result.done) {
    const event: StreamEvent & { usage?: any } = { done: true };
    if (result.value?.usage) {
      event.usage = result.value.usage;
    }
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  } else if (result.value) {
    const event: StreamEvent & { thinking?: string } = { content: result.value.content || '' };
    if (result.value.thinking) event.thinking = result.value.thinking;
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

function getProviderFromModel(model: string): string {
  if (model.startsWith('deepseek')) return 'deepseek';
  if (model.startsWith('claude') || model.startsWith('anthropic')) return 'anthropic';
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('LongCat') || model.toLowerCase().includes('longcat')) return 'longcat';
  if (model.startsWith('qwen')) return 'qwen';
  return 'deepseek';
}

function estimateInputTokens(messages: AIMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    total += Math.ceil(text.length / 2); // 粗略估计：中文约0.5 token/字，英文约0.25 token/字
  }
  return Math.max(total, 100);
}
