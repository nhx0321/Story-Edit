// 站外 API 端点 — OpenAI 兼容格式
// POST /api/v1/chat/completions
// 用户通过 API Key 从站外调用平台 AI 模型

import type { FastifyInstance } from 'fastify';
import { verifyKey } from '../services/token-relay/api-key-service';
import * as rateLimiter from '../services/token-relay/rate-limiter';
import * as tokenBilling from '../services/token-relay/token-billing';
import * as channelManager from '../services/token-relay/channel-manager';
import * as pricingService from '../services/token-relay/model-pricing';
import * as consumptionTracker from '../services/token-relay/consumption-tracker';
import { decryptApiKey } from '../services/ai-gateway/crypto';
import { createAdapter } from '@story-edit/ai-adapters';
import type { AIMessage } from '@story-edit/ai-adapters';
import { randomUUID } from 'crypto';

interface ChatCompletionRequest {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  stop?: string[];
}

interface ApiKeyRecord {
  id: string;
  userId: string;
  keyHash: string;
  keyPrefix: string;
  status: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  ipWhitelist: string[] | null;
  rateLimitPerMin: number;
}

function getRequestIp(request: { ip?: string; headers: Record<string, unknown> }) {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]!.trim();
  }
  return request.ip || 'unknown';
}

function isIpAllowed(ipWhitelist: string[] | null, ip: string) {
  if (!ipWhitelist || ipWhitelist.length === 0) return true;
  return ipWhitelist.includes(ip);
}

export async function registerExternalApiRoute(app: FastifyInstance) {
  // 非流式
  app.post<{ Body: ChatCompletionRequest }>('/api/v1/chat/completions', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: { message: '缺少 API Key', type: 'authentication_error' } });
    }

    const apiKey = authHeader.slice(7);
    const keyRecord = await verifyKey(apiKey) as ApiKeyRecord | null;
    if (!keyRecord) {
      return reply.status(401).send({ error: { message: 'API Key 无效或已撤销', type: 'authentication_error' } });
    }

    const requestIp = getRequestIp(request);
    if (!isIpAllowed(keyRecord.ipWhitelist, requestIp)) {
      return reply.status(403).send({ error: { message: '当前 IP 不在 API Key 白名单中', type: 'access_denied' } });
    }

    const ipRateLimit = await rateLimiter.checkIpRate(requestIp);
    if (!ipRateLimit.allowed) {
      return reply.status(429)
        .header('X-RateLimit-Limit', String(rateLimiter.RATE_LIMITS.apiIp.maxRequests))
        .header('X-RateLimit-Remaining', '0')
        .header('X-RateLimit-Reset', String(Math.ceil(ipRateLimit.resetAt.getTime() / 1000)))
        .send({ error: { message: '当前 IP 请求过于频繁，请稍后重试', type: 'rate_limit_error' } });
    }

    // 速率限制
    const rl = await rateLimiter.checkApiKeyRate(keyRecord.id, (keyRecord as any).rateLimitPerMin);
    if (!rl.allowed) {
      return reply.status(429)
        .header('X-RateLimit-Limit', String((keyRecord as any).rateLimitPerMin ?? 60))
        .header('X-RateLimit-Remaining', '0')
        .header('X-RateLimit-Reset', String(Math.ceil(rl.resetAt.getTime() / 1000)))
        .send({ error: { message: '请求过于频繁，请稍后重试', type: 'rate_limit_error' } });
    }

    const body = request.body;
    if (!body.model || !body.messages?.length) {
      return reply.status(400).send({ error: { message: '缺少 model 或 messages', type: 'invalid_request_error' } });
    }

    const isStream = body.stream === true;

    try {
      if (isStream) {
        await handleStream(request, reply, body, keyRecord, app);
      } else {
        await handleNonStream(request, reply, body, keyRecord, app);
      }
    } catch (err: unknown) {
      app.log.error({ err }, 'External API error');
      if (!reply.sent) {
        return reply.status(500).send({
          error: { message: err instanceof Error ? err.message : '内部错误', type: 'server_error' },
        });
      }
    }
  });
}

// ===== 非流式处理 =====
async function handleNonStream(
  _request: any,
  reply: any,
  body: ChatCompletionRequest,
  keyRecord: ApiKeyRecord,
  app: FastifyInstance,
) {
  const provider = getProviderFromModel(body.model);
  const modelId = extractModelId(body.model);
  const pricing = await pricingService.getModelPricing(provider, modelId);
  if (!pricing) {
    return reply.status(400).send({ error: { message: `模型 ${body.model} 暂不可用`, type: 'invalid_request_error' } });
  }

  await tokenBilling.ensureAccount(keyRecord.userId);

  // 模型访问权限检查
  const modelAccess = await tokenBilling.checkModelAccess(keyRecord.userId, body.model);
  if (!modelAccess.allowed) {
    return reply.status(403).send({ error: { message: modelAccess.reason || '无权使用该模型', type: 'access_denied' } });
  }

  // 每日限制（按角色）
  const dailyCheck = await tokenBilling.checkDailyLimit(keyRecord.userId, body.model);
  if (!dailyCheck.allowed) {
    return reply.status(429).send({ error: { message: `今日免费额度已用完（${dailyCheck.dailyUsed}/${dailyCheck.dailyLimit} tokens），请充值`, type: 'insufficient_quota' } });
  }

  const estimatedInput = estimateInputTokens(body.messages);
  const estimatedOutput = body.max_tokens || 4096;
  const { estimatedCost } = tokenBilling.estimateCost(
    pricing.inputPricePer1m, pricing.outputPricePer1m, estimatedInput, estimatedOutput,
  );

  const hasBalance = await tokenBilling.checkBalance(keyRecord.userId, estimatedCost);
  if (!hasBalance) {
    return reply.status(402).send({ error: { message: 'Token余额不足，请充值', type: 'insufficient_quota' } });
  }

  const preDeduct = await tokenBilling.preDeduct(keyRecord.userId, estimatedCost);
  if (!preDeduct.success) {
    return reply.status(402).send({ error: { message: preDeduct.error || '余额不足', type: 'insufficient_quota' } });
  }

  const role = await tokenBilling.getUserRole(keyRecord.userId);
  const userTier = role === 'paid' || role === 'admin' ? 'vip' : 'free';
  const channel = await channelManager.selectChannel(provider, userTier, { excludeIds: [] });
  if (!channel) {
    await tokenBilling.refundIntent(keyRecord.userId, estimatedCost);
    return reply.status(503).send({ error: { message: '暂无可用AI渠道', type: 'server_error' } });
  }

  const channelApiKey = decryptApiKey(channel.apiKeyEncrypted);
  const adapter = createAdapter(provider, {
    apiKey: channelApiKey,
    baseUrl: channel.baseUrl || undefined,
    defaultModel: modelId,
  });

  try {
    const result = await adapter.chat(body.messages as AIMessage[], {
      model: modelId,
      temperature: body.temperature,
      maxTokens: body.max_tokens,
    });

    const usage = result.usage || { promptTokens: 0, completionTokens: 0 };
    const hasUsage = usage.promptTokens > 0 || usage.completionTokens > 0;
    const billedInputTokens = hasUsage ? usage.promptTokens : estimatedInput;
    const billedOutputTokens = hasUsage ? usage.completionTokens : estimatedOutput;
    const { finalCost } = await tokenBilling.finalizeCharge(
      keyRecord.userId, estimatedCost,
      { inputTokens: billedInputTokens, outputTokens: billedOutputTokens },
      pricing.inputPricePer1m, pricing.outputPricePer1m,
    );

    await channelManager.recordChannelUsage(channel.id, billedInputTokens + billedOutputTokens);
    await consumptionTracker.recordConsumption({
      userId: keyRecord.userId,
      source: 'external_api',
      apiKeyId: keyRecord.id,
      provider,
      modelId,
      requestType: 'chat',
      inputTokens: billedInputTokens,
      outputTokens: billedOutputTokens,
      cost: finalCost,
    });

    const responseId = `chatcmpl-${randomUUID().slice(0, 8)}`;
    return reply.send({
      id: responseId,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: result.content,
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: billedInputTokens,
        completion_tokens: billedOutputTokens,
        total_tokens: billedInputTokens + billedOutputTokens,
      },
    });
  } catch (err: unknown) {
    await tokenBilling.refundIntent(keyRecord.userId, estimatedCost);
    await channelManager.markChannelError(channel.id, err instanceof Error ? err.message : '未知错误');
    throw err;
  }
}

// ===== 流式处理 =====
async function handleStream(
  _request: any,
  reply: any,
  body: ChatCompletionRequest,
  keyRecord: ApiKeyRecord,
  app: FastifyInstance,
) {
  const provider = getProviderFromModel(body.model);
  const modelId = extractModelId(body.model);
  const pricing = await pricingService.getModelPricing(provider, modelId);
  if (!pricing) {
    return reply.status(400).send({ error: { message: `模型 ${body.model} 暂不可用`, type: 'invalid_request_error' } });
  }

  await tokenBilling.ensureAccount(keyRecord.userId);

  // 模型访问权限检查
  const modelAccess = await tokenBilling.checkModelAccess(keyRecord.userId, body.model);
  if (!modelAccess.allowed) {
    return reply.status(403).send({ error: { message: modelAccess.reason || '无权使用该模型', type: 'access_denied' } });
  }

  // 每日限制（按角色）
  const dailyCheck = await tokenBilling.checkDailyLimit(keyRecord.userId, body.model);
  if (!dailyCheck.allowed) {
    return reply.status(429).send({ error: { message: `今日免费额度已用完（${dailyCheck.dailyUsed}/${dailyCheck.dailyLimit} tokens），请充值`, type: 'insufficient_quota' } });
  }

  const estimatedInput = estimateInputTokens(body.messages);
  const estimatedOutput = body.max_tokens || 4096;
  const { estimatedCost } = tokenBilling.estimateCost(
    pricing.inputPricePer1m, pricing.outputPricePer1m, estimatedInput, estimatedOutput,
  );

  const hasBalance = await tokenBilling.checkBalance(keyRecord.userId, estimatedCost);
  if (!hasBalance) {
    return reply.status(402).send({ error: { message: 'Token余额不足，请充值', type: 'insufficient_quota' } });
  }

  const preDeduct = await tokenBilling.preDeduct(keyRecord.userId, estimatedCost);
  if (!preDeduct.success) {
    return reply.status(402).send({ error: { message: preDeduct.error || '余额不足', type: 'insufficient_quota' } });
  }

  const role = await tokenBilling.getUserRole(keyRecord.userId);
  const userTier = role === 'paid' || role === 'admin' ? 'vip' : 'free';
  const channel = await channelManager.selectChannel(provider, userTier, { excludeIds: [] });
  if (!channel) {
    await tokenBilling.refundIntent(keyRecord.userId, estimatedCost);
    return reply.status(503).send({ error: { message: '暂无可用AI渠道', type: 'server_error' } });
  }

  const channelApiKey = decryptApiKey(channel.apiKeyEncrypted);
  const adapter = createAdapter(provider, {
    apiKey: channelApiKey,
    baseUrl: channel.baseUrl || undefined,
    defaultModel: modelId,
  });

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  });

  const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 15000);
  const responseId = `chatcmpl-${randomUUID().slice(0, 8)}`;
  const created = Math.floor(Date.now() / 1000);
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let hasError = false;

  try {
    const stream = adapter.chatStream(body.messages as AIMessage[], {
      model: modelId,
      temperature: body.temperature,
      maxTokens: body.max_tokens,
    });

    for await (const chunk of stream) {
      if (chunk.done) {
        if (chunk.usage) {
          totalInputTokens = chunk.usage.promptTokens;
          totalOutputTokens = chunk.usage.completionTokens;
        }
        // 发送最终 chunk
        const finishChunk = JSON.stringify({
          id: responseId,
          object: 'chat.completion.chunk',
          created,
          model: body.model,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop',
          }],
          usage: chunk.usage ? {
            prompt_tokens: chunk.usage.promptTokens,
            completion_tokens: chunk.usage.completionTokens,
            total_tokens: chunk.usage.promptTokens + chunk.usage.completionTokens,
          } : undefined,
        });
        reply.raw.write(`data: ${finishChunk}\n\n`);
      } else {
        const delta: Record<string, string> = { content: chunk.content || '' };
        if (chunk.thinking) delta.reasoning_content = chunk.thinking;
        const streamChunk = JSON.stringify({
          id: responseId,
          object: 'chat.completion.chunk',
          created,
          model: body.model,
          choices: [{
            index: 0,
            delta,
            finish_reason: null,
          }],
        });
        reply.raw.write(`data: ${streamChunk}\n\n`);
      }
    }
  } catch (err: unknown) {
    hasError = true;
    await tokenBilling.refundIntent(keyRecord.userId, estimatedCost);
    await channelManager.markChannelError(channel.id, err instanceof Error ? err.message : '未知错误');

    const errorChunk = JSON.stringify({
      error: { message: err instanceof Error ? err.message : 'AI 调用失败', type: 'server_error' },
    });
    reply.raw.write(`data: ${errorChunk}\n\n`);
  } finally {
    clearInterval(heartbeat);
  }

  // 结算
  if (!hasError && (totalInputTokens > 0 || totalOutputTokens > 0)) {
    const { finalCost } = await tokenBilling.finalizeCharge(
      keyRecord.userId, estimatedCost,
      { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      pricing.inputPricePer1m, pricing.outputPricePer1m,
    );

    await channelManager.recordChannelUsage(channel.id, totalInputTokens + totalOutputTokens);
    await consumptionTracker.recordConsumption({
      userId: keyRecord.userId,
      source: 'external_api',
      apiKeyId: keyRecord.id,
      provider,
      modelId,
      requestType: 'chat',
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cost: finalCost,
    });
  } else if (!hasError) {
    const { finalCost } = await tokenBilling.finalizeCharge(
      keyRecord.userId, estimatedCost,
      { inputTokens: estimatedInput, outputTokens: estimatedOutput },
      pricing.inputPricePer1m, pricing.outputPricePer1m,
    );

    await channelManager.recordChannelUsage(channel.id, estimatedInput + estimatedOutput);
    await consumptionTracker.recordConsumption({
      userId: keyRecord.userId,
      source: 'external_api',
      apiKeyId: keyRecord.id,
      provider,
      modelId,
      requestType: 'chat',
      inputTokens: estimatedInput,
      outputTokens: estimatedOutput,
      cost: finalCost,
    });
  }

  reply.raw.write('data: [DONE]\n\n');
  reply.raw.end();
}

// ===== Helpers =====

function extractModelId(model: string): string {
  const slashIdx = model.indexOf('/');
  if (slashIdx > 0) {
    const prefix = model.substring(0, slashIdx).toLowerCase();
    if (['deepseek', 'claude', 'anthropic', 'gpt', 'o1', 'o3', 'o4', 'longcat', 'qwen', 'openai'].includes(prefix)) {
      return model.substring(slashIdx + 1);
    }
  }
  return model;
}

function getProviderFromModel(model: string): string {
  if (model.startsWith('deepseek')) return 'deepseek';
  if (model.startsWith('claude') || model.startsWith('anthropic')) return 'anthropic';
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) return 'openai';
  if (model.startsWith('LongCat') || model.toLowerCase().includes('longcat')) return 'longcat';
  if (model.startsWith('qwen')) return 'qwen';
  return 'deepseek';
}

function estimateInputTokens(messages: { content: string }[]): number {
  let total = 0;
  for (const msg of messages) {
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    total += Math.ceil(text.length / 2);
  }
  return Math.max(total, 100);
}
