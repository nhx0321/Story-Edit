// AI 流式任务管理器 — 基于 Redis 持久化事件总线
// 允许用户关闭页面后重新打开时续接 AI 生成内容

import { Redis } from 'ioredis';
import type { AiJobMeta, StreamEvent } from './types';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const JOB_TTL = 3600; // 任务完成后 1 小时自动清理

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(REDIS_URL, { lazyConnect: true });
    redis.connect().catch(() => {
      // Redis 不可用时标记为 null，后续操作回退
      redis = null;
    });
  }
  return redis;
}

const KEY_PREFIX = 'ai:job';

function jobKey(jobId: string) { return `${KEY_PREFIX}:${jobId}:meta`; }
function eventsKey(jobId: string) { return `${KEY_PREFIX}:${jobId}:events`; }
function channelKey(jobId: string) { return `${KEY_PREFIX}:${jobId}:channel`; }

// ========== 任务管理 ==========

export async function createJob(
  userId: string,
  projectId?: string,
): Promise<string> {
  const r = getRedis();
  if (!r) return ''; // Redis 不可用，返回空 jobId（回退到直连模式）

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const meta: AiJobMeta = {
    jobId,
    userId,
    projectId,
    status: 'running',
    createdAt: Date.now(),
  };
  await r.setex(jobKey(jobId), JOB_TTL, JSON.stringify(meta));
  return jobId;
}

export async function getJobMeta(jobId: string): Promise<AiJobMeta | null> {
  const r = getRedis();
  if (!r) return null;
  const raw = await r.get(jobKey(jobId));
  if (!raw) return null;
  return JSON.parse(raw) as AiJobMeta;
}

export async function completeJob(jobId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  const raw = await r.get(jobKey(jobId));
  if (!raw) return;
  const meta: AiJobMeta = JSON.parse(raw);
  meta.status = 'completed';
  await r.setex(jobKey(jobId), JOB_TTL, JSON.stringify(meta));
}

export async function failJob(jobId: string, error: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  const raw = await r.get(jobKey(jobId));
  if (!raw) return;
  const meta: AiJobMeta = JSON.parse(raw);
  meta.status = 'failed';
  meta.error = error;
  await r.setex(jobKey(jobId), JOB_TTL, JSON.stringify(meta));
}

// ========== 事件存储 ==========

export async function appendEvent(jobId: string, event: StreamEvent): Promise<void> {
  const r = getRedis();
  if (!r) return;
  const data = JSON.stringify(event);
  // 同时写入 events 列表和发布到频道
  await Promise.all([
    r.rpush(eventsKey(jobId), data),
    r.publish(channelKey(jobId), data),
  ]);
  // 刷新 TTL
  r.expire(eventsKey(jobId), JOB_TTL).catch(() => {});
}

export async function getEvents(jobId: string): Promise<StreamEvent[]> {
  const r = getRedis();
  if (!r) return [];
  const rawEvents = await r.lrange(eventsKey(jobId), 0, -1);
  return rawEvents.map(e => JSON.parse(e) as StreamEvent);
}

// ========== 实时订阅 ==========

/** 订阅新事件（pub/sub），返回退订函数 */
export async function subscribeToJob(
  jobId: string,
  onEvent: (event: StreamEvent) => void,
): Promise<() => void> {
  const r = getRedis();
  if (!r) {
    // Redis 不可用 — 返回空退订函数
    return () => {};
  }

  // ioredis subscribe 需要使用单独的连接（会进入 subscribe 模式）
  const sub = new Redis(REDIS_URL);
  await sub.connect();
  await sub.subscribe(channelKey(jobId));

  sub.on('message', (_channel, message) => {
    try {
      const event = JSON.parse(message) as StreamEvent;
      onEvent(event);
    } catch { /* malformed */ }
  });

  return () => {
    sub.unsubscribe(channelKey(jobId));
    sub.quit().catch(() => {});
  };
}

// ========== 清理 ==========

/** 清理过期的任务数据和 pub/sub 残留 */
export async function cleanupExpiredJobs(): Promise<void> {
  const r = getRedis();
  if (!r) return;
  // Redis EXPIRE 会自动清理 key，这里主要处理意外残留
  try {
    const keys = await r.keys(`${KEY_PREFIX}:*`);
    for (const key of keys) {
      const ttl = await r.ttl(key);
      if (ttl < 0) {
        await r.del(key);
      }
    }
  } catch { /* noop */ }
}

/** 检查 Redis 是否可用 */
export function isRedisAvailable(): boolean {
  return redis !== null && redis.status === 'ready';
}
