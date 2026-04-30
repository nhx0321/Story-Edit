// 速率限制器 — 固定窗口算法，Redis + 内存回退
import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) {
    return redis;
  }

  try {
    redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 0 });
    redis.connect().catch(() => { redis = null; });
  } catch {
    redis = null;
  }

  return redis;
}

// 内存回退（窗口过期后自动清理）
const memoryStore = new Map<string, { count: number; resetAt: number }>();

const RL_PREFIX = 'ratelimit:';

// ========== 限制配置 ==========

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

/** 默认限制配置 */
export const RATE_LIMITS = {
  /** 免费用户AI聊天：10次/分钟 */
  freeUserChat: { maxRequests: 10, windowSeconds: 60 },
  /** VIP用户AI聊天：30次/分钟 */
  vipUserChat: { maxRequests: 30, windowSeconds: 60 },
  /** 外部API（per key）：60次/分钟 */
  apiKey: { maxRequests: 60, windowSeconds: 60 },
  /** 外部API（per IP）：20次/分钟 */
  apiIp: { maxRequests: 20, windowSeconds: 60 },
};

// ========== 核心逻辑 ==========

/**
 * 检查是否超过速率限制
 * @returns { allowed: boolean, remaining: number, resetAt: Date }
 */
export async function checkRateLimit(
  keyType: string,
  keyId: string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const r = getRedis();
  if (r) {
    return checkRedisRateLimit(r, keyType, keyId, config);
  }
  return checkMemoryRateLimit(keyType, keyId, config);
}

/**
 * 记录一次请求（等同 check + increment）
 */
export async function consumeRateLimit(
  keyType: string,
  keyId: string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const r = getRedis();
  if (r) {
    return consumeRedisRateLimit(r, keyType, keyId, config);
  }
  return consumeMemoryRateLimit(keyType, keyId, config);
}

// ========== Redis 实现 ==========

async function checkRedisRateLimit(
  r: Redis,
  keyType: string,
  keyId: string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = Date.now();
  const windowStart = now - (config.windowSeconds * 1000);
  const key = `${RL_PREFIX}${keyType}:${keyId}`;

  try {
    // 清除过期条目 + 计数当前窗口内条目
    const count = await r.zcount(key, windowStart, '+inf');
    const remaining = Math.max(0, config.maxRequests - count);
    const resetAt = new Date(now + config.windowSeconds * 1000);

    return { allowed: count < config.maxRequests, remaining, resetAt };
  } catch {
    return { allowed: true, remaining: config.maxRequests, resetAt: new Date(now + config.windowSeconds * 1000) };
  }
}

async function consumeRedisRateLimit(
  r: Redis,
  keyType: string,
  keyId: string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = Date.now();
  const windowStart = now - (config.windowSeconds * 1000);
  const key = `${RL_PREFIX}${keyType}:${keyId}`;

  try {
    const multi = r.multi();
    // 清除过期条目
    multi.zremrangebyscore(key, 0, windowStart);
    // 计数
    multi.zcard(key);
    // 添加当前请求
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
    multi.zadd(key, now, member);
    // 设置过期
    multi.expire(key, config.windowSeconds + 5);

    const results = await multi.exec();
    const count = (results?.[1]?.[1] as number) ?? 0;
    const remaining = Math.max(0, config.maxRequests - count - 1);
    const resetAt = new Date(now + config.windowSeconds * 1000);

    return { allowed: count < config.maxRequests, remaining, resetAt };
  } catch {
    return { allowed: true, remaining: config.maxRequests, resetAt: new Date(now + config.windowSeconds * 1000) };
  }
}

// ========== 内存回退实现 ==========

function checkMemoryRateLimit(
  keyType: string,
  keyId: string,
  config: RateLimitConfig,
): { allowed: boolean; remaining: number; resetAt: Date } {
  const now = Date.now();
  const key = `${keyType}:${keyId}`;
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetAt) {
    return { allowed: true, remaining: config.maxRequests, resetAt: new Date(now + config.windowSeconds * 1000) };
  }

  const remaining = Math.max(0, config.maxRequests - entry.count);
  return { allowed: entry.count < config.maxRequests, remaining, resetAt: new Date(entry.resetAt) };
}

function consumeMemoryRateLimit(
  keyType: string,
  keyId: string,
  config: RateLimitConfig,
): { allowed: boolean; remaining: number; resetAt: Date } {
  const now = Date.now();
  const key = `${keyType}:${keyId}`;
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + config.windowSeconds * 1000;
    memoryStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: new Date(resetAt) };
  }

  entry.count++;
  const remaining = Math.max(0, config.maxRequests - entry.count);

  // 定期清理过期条目（概率性，每100次清理一次）
  if (Math.random() < 0.01) {
    for (const [k, v] of memoryStore) {
      if (now > v.resetAt) memoryStore.delete(k);
    }
  }

  return { allowed: entry.count <= config.maxRequests, remaining, resetAt: new Date(entry.resetAt) };
}

// ========== 便捷方法 ==========

/**
 * 检查用户AI聊天速率限制
 * @param userId 用户ID
 * @param tier 用户级别 free/vip
 */
export async function checkUserChatRate(
  userId: string,
  tier: 'free' | 'vip' = 'vip',
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const config = tier === 'free' ? RATE_LIMITS.freeUserChat : RATE_LIMITS.vipUserChat;
  return consumeRateLimit('chat', userId, config);
}

/**
 * 检查API Key速率限制
 * @param keyId API Key ID
 * @param customLimit 自定义限制（从key配置中读取）
 */
export async function checkApiKeyRate(
  keyId: string,
  customLimit?: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const maxRequests = customLimit ?? RATE_LIMITS.apiKey.maxRequests;
  return consumeRateLimit('apikey', keyId, { maxRequests, windowSeconds: RATE_LIMITS.apiKey.windowSeconds });
}

/**
 * 检查IP速率限制（外部API）
 */
export async function checkIpRate(
  ip: string,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  return consumeRateLimit('ip', ip, RATE_LIMITS.apiIp);
}

// 定时清理内存Store（每5分钟）
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memoryStore) {
      if (now > v.resetAt) memoryStore.delete(k);
    }
  }, 300000);
}
