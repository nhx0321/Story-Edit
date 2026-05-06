// 上游渠道池管理 — 多渠道负载均衡、故障转移、自动轮换
import type { AIProvider } from '@story-edit/shared';
import { db } from '../../db';
import { apiChannels } from '../../db/schema';
import { eq, and, sql, lt, or } from 'drizzle-orm';

export interface ChannelInfo {
  id: string;
  provider: string;
  name: string | null;
  apiKeyEncrypted: string;
  baseUrl: string | null;
  priority: number;
  weight: number;
  status: string;
  dailyLimit: number;
  dailyUsed: number;
  userTier: string;
}

// 错误冷却时间（毫秒）：渠道出错后暂时跳过
// 增量退避：首次5s，每次翻倍，上限5min —— 短暂故障快速恢复，持续故障拉长间隔
const BASE_COOLDOWN_MS = 5 * 1000; // 首次5秒
const MAX_COOLDOWN_MS = 5 * 60 * 1000; // 上限5分钟
const QUOTA_COOLDOWN_MS = 30 * 60 * 1000; // 上游账户额度不足时冷却30分钟，优先切其他账户
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const BEIJING_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;
const LONGCAT_PROVIDER: AIProvider = 'longcat';
export const SLOW_RESPONSE_THRESHOLD_MS = 45_000;
export const SLOW_CHANNEL_ERROR_MESSAGE = 'slow_response';

// 渠道连续错误计数（内存中维护，重置在成功调用时）
const channelErrorCounts = new Map<string, number>();

function isQuotaLikeError(errorMessage?: string | null): boolean {
  if (!errorMessage) return false;
  const text = errorMessage.toLowerCase();
  return [
    '余额不足',
    'token不足',
    '额度不足',
    '额度已用完',
    'insufficient',
    'insufficient_quota',
    'quota',
    'credit',
    'balance',
    'billing',
    'payment',
    'exhausted',
  ].some(keyword => text.includes(keyword.toLowerCase()));
}

function getCooldown(consecutiveErrors: number, errorMessage?: string | null): number {
  if (isQuotaLikeError(errorMessage)) return QUOTA_COOLDOWN_MS;
  if (consecutiveErrors <= 1) return BASE_COOLDOWN_MS;
  const cooldown = BASE_COOLDOWN_MS * Math.pow(2, consecutiveErrors - 1);
  return Math.min(cooldown, MAX_COOLDOWN_MS);
}

// 轮询计数器（内存中维护，每个provider + userTier 组合独立计数）
const roundRobinCounters = new Map<string, number>();

function getCounterKey(provider: string, userTier: string): string {
  return `${provider}:${userTier}`;
}

function isLongcatProvider(provider?: string | null): boolean {
  return provider === LONGCAT_PROVIDER;
}

function getNextBeijingMidnight(now: Date): Date {
  const beijingNowMs = now.getTime() + BEIJING_TIME_OFFSET_MS;
  const nextBeijingMidnightMs = Math.floor(beijingNowMs / ONE_DAY_MS) * ONE_DAY_MS + ONE_DAY_MS;
  return new Date(nextBeijingMidnightMs - BEIJING_TIME_OFFSET_MS);
}

function getNextDailyResetAt(provider: string, now: Date): Date {
  if (isLongcatProvider(provider)) {
    return getNextBeijingMidnight(now);
  }
  return new Date(now.getTime() + ONE_DAY_MS);
}

/**
 * 根据模型和用户等级选择可用渠道
 * 支持：
 * - 同优先级按权重轮询
 * - 渠道错误冷却（增量退避）
 * - 渠道超限时自动跳过
 *
 * 注意：取消提供商降级机制，只在用户选择的 provider 内选渠道
 */
export async function selectChannel(
  provider: string,
  userTier: string,
  options?: { excludeIds?: string[]; allowCoolingFallback?: boolean },
): Promise<ChannelInfo | null> {
  const now = new Date();
  const excludeIds = new Set(options?.excludeIds ?? []);
  const allowCoolingFallback = options?.allowCoolingFallback ?? true;

  const channels = await db.select()
    .from(apiChannels)
    .where(
      and(
        eq(apiChannels.provider, provider),
        eq(apiChannels.status, 'active'),
      ),
    );

  if (channels.length === 0) {
    console.log(`[channel-manager] No channels found for provider=${provider}`);
    return null;
  }

  // 筛选符合用户等级的渠道
  const eligible = channels.filter(c =>
    !excludeIds.has(c.id) && (c.userTier === 'all' || c.userTier === userTier),
  );
  if (eligible.length === 0) {
    console.log(`[channel-manager] No eligible channels for provider=${provider}, userTier=${userTier}`);
    return null;
  }

  // 过滤出可用渠道：未超日限额 + 错误增量退避
  const available = eligible.filter(c => {
    if ((c.dailyUsed ?? 0) >= (c.dailyLimit ?? 0)) return false;
    if (c.lastErrorAt) {
      const errors = channelErrorCounts.get(c.id) ?? 1;
      const cooldownEnd = new Date(c.lastErrorAt.getTime() + getCooldown(errors, c.lastErrorMessage));
      if (now < cooldownEnd) return false;
    }
    return true;
  });

  console.log(`[channel-manager] provider=${provider}, userTier=${userTier}, total=${channels.length}, eligible=${eligible.length}, available=${available.length}, cooling=${eligible.length - available.length}, excluded=${excludeIds.size}`);
  eligible.forEach(c => {
    const isAvail = available.some(a => a.id === c.id);
    const errors = channelErrorCounts.get(c.id) ?? 0;
    console.log(`  - ${c.name}(${c.id}): priority=${c.priority}, weight=${c.weight}, lastError=${c.lastErrorAt?.toISOString() || 'none'}, errors=${errors}, available=${isAvail}`);
  });

  // 当所有渠道都在冷却时：放行冷却时间最短的那个（避免完全拒绝请求）
  if (available.length === 0) {
    if (!allowCoolingFallback) return null;
    const notExhausted = eligible.filter(c =>
      (c.dailyUsed ?? 0) < (c.dailyLimit ?? 0),
    );
    if (notExhausted.length === 0) return null;

    let bestChannel = notExhausted[0]!;
    let bestRemaining = Infinity;
    for (const c of notExhausted) {
      if (!c.lastErrorAt) { bestChannel = c; bestRemaining = 0; break; }
      const errors = channelErrorCounts.get(c.id) ?? 1;
      const cooldownEnd = new Date(c.lastErrorAt.getTime() + getCooldown(errors, c.lastErrorMessage));
      const remaining = cooldownEnd.getTime() - now.getTime();
      if (remaining < bestRemaining) {
        bestRemaining = remaining;
        bestChannel = c;
      }
    }
    // 如果剩余冷却时间 < 30s，直接放行；否则仍返回最短的，让重试循环有机会
    return bestChannel as ChannelInfo;
  }

  // 按优先级分组
  const groups = new Map<number, typeof available>();
  for (const ch of available) {
    const pri = ch.priority ?? 0;
    if (!groups.has(pri)) groups.set(pri, []);
    groups.get(pri)!.push(ch);
  }

  // 取最高优先级组
  const maxPriority = Math.max(...groups.keys());
  const topGroup = groups.get(maxPriority)!;

  // 在同优先级组内按权重轮询
  const counterKey = getCounterKey(provider, userTier);
  let counter = roundRobinCounters.get(counterKey) ?? 0;

  const totalWeight = topGroup.reduce((sum, ch) => sum + (ch.weight ?? 1), 0);
  const normalizedCounter = counter % totalWeight;

  let cumulativeWeight = 0;
  for (const ch of topGroup) {
    cumulativeWeight += ch.weight ?? 1;
    if (normalizedCounter < cumulativeWeight) {
      roundRobinCounters.set(counterKey, counter + 1);
      return ch as ChannelInfo;
    }
  }

  roundRobinCounters.set(counterKey, counter + 1);
  return topGroup[0] as ChannelInfo;
}

/**
 * 记录渠道消耗
 */
export async function recordChannelUsage(channelId: string, tokens: number): Promise<void> {
  await db.update(apiChannels)
    .set({
      dailyUsed: sql`${apiChannels.dailyUsed} + ${tokens}`,
      updatedAt: new Date(),
    })
    .where(eq(apiChannels.id, channelId));
}

/**
 * 标记渠道错误 — 递增连续错误计数（增量退避）
 */
export async function markChannelError(channelId: string, errorMessage: string): Promise<void> {
  const now = new Date();
  const current = channelErrorCounts.get(channelId) ?? 0;
  channelErrorCounts.set(channelId, current + 1);

  if (isQuotaLikeError(errorMessage)) {
    const [exhaustedLongcatChannel] = await db.update(apiChannels)
      .set({
        dailyUsed: sql`COALESCE(${apiChannels.dailyLimit}, 0)`,
        dailyResetAt: getNextBeijingMidnight(now),
        lastErrorAt: now,
        lastErrorMessage: errorMessage,
        updatedAt: now,
      })
      .where(
        and(
          eq(apiChannels.id, channelId),
          eq(apiChannels.provider, LONGCAT_PROVIDER),
        ),
      )
      .returning({ id: apiChannels.id });

    if (exhaustedLongcatChannel) return;
  }

  await db.update(apiChannels)
    .set({
      lastErrorAt: now,
      lastErrorMessage: errorMessage,
      updatedAt: now,
    })
    .where(eq(apiChannels.id, channelId));
}

/**
 * 标记渠道慢响应 — 复用现有错误冷却窗口，但不跨模型切换
 */
export async function markChannelSlow(channelId: string, elapsedMs: number): Promise<void> {
  await markChannelError(channelId, `${SLOW_CHANNEL_ERROR_MESSAGE}:${elapsedMs}`);
}

export async function recordSuccessfulChannelResponse(channelId: string, elapsedMs: number): Promise<void> {
  if (elapsedMs >= SLOW_RESPONSE_THRESHOLD_MS) {
    await markChannelSlow(channelId, elapsedMs);
    return;
  }

  await clearChannelError(channelId);
}

/**
 * 清除渠道错误状态 — 调用成功后重置连续错误计数
 */
export async function clearChannelError(channelId: string): Promise<void> {
  channelErrorCounts.delete(channelId);

  await db.update(apiChannels)
    .set({
      lastErrorAt: null,
      lastErrorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(apiChannels.id, channelId));
}

/**
 * 渠道日限额用尽后自动重置 + 恢复 rate_limited 渠道
 * 应定期调用（如每分钟）
 */
export async function checkChannelHealth(): Promise<void> {
  const now = new Date();

  // 1. 重置已到期的日消耗
  const channelsToReset = await db.select()
    .from(apiChannels)
    .where(
      and(
        lt(apiChannels.dailyResetAt, now),
        or(
          sql`${apiChannels.dailyUsed} > 0`,
          eq(apiChannels.status, 'rate_limited'),
        ),
      ),
    );

  for (const ch of channelsToReset) {
    await db.update(apiChannels)
      .set({
        dailyUsed: 0,
        dailyResetAt: getNextDailyResetAt(ch.provider, now),
        status: 'active',
        lastErrorAt: null,
        lastErrorMessage: null,
        updatedAt: now,
      })
      .where(eq(apiChannels.id, ch.id));
    channelErrorCounts.delete(ch.id);
  }

  // 2. 初始化没有 dailyResetAt 的渠道
  const channelsWithoutReset = await db.select()
    .from(apiChannels)
    .where(sql`${apiChannels.dailyResetAt} IS NULL`);

  for (const ch of channelsWithoutReset) {
    await db.update(apiChannels)
      .set({
        dailyResetAt: getNextDailyResetAt(ch.provider, now),
        updatedAt: now,
      })
      .where(eq(apiChannels.id, ch.id));
  }
}

/**
 * 获取当前可用渠道统计（用于管理后台/监控）
 */
export async function getChannelStats(provider?: string): Promise<{
  total: number;
  active: number;
  rateLimited: number;
  exhausted: number;
  cooling: number;
}> {
  const conditions = provider
    ? [eq(apiChannels.provider, provider)]
    : [];

  const channels = await db.select()
    .from(apiChannels)
    .where(and(...conditions));

  const now = new Date();
  const stats = { total: channels.length, active: 0, rateLimited: 0, exhausted: 0, cooling: 0 };

  for (const ch of channels) {
    if (ch.status === 'active') stats.active++;
    if (ch.status === 'rate_limited') stats.rateLimited++;
    if ((ch.dailyUsed ?? 0) >= (ch.dailyLimit ?? 0)) stats.exhausted++;
    if (ch.lastErrorAt) {
      const errors = channelErrorCounts.get(ch.id) ?? 1;
      const cooldownEnd = new Date(ch.lastErrorAt.getTime() + getCooldown(errors, ch.lastErrorMessage));
      if (now < cooldownEnd) stats.cooling++;
    }
  }

  return stats;
}
