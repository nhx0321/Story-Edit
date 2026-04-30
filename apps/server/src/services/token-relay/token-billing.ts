// Token计费引擎 — 预扣→后校正→退款
// 内部精度: 1元 = 10,000,000 单位（1/10000 分）

import { db } from '../../db';
import { users, userTokenAccounts, tokenConsumptionLogs, modelPricing, userGroups } from '../../db/schema';
import { eq, and, sql } from 'drizzle-orm';

// 内部精度常量
export const UNITS_PER_YUAN = 10_000_000;
export const UNITS_PER_CENT = 100_000;
export const UNITS_PER_MILLICENT = 100;

interface CostEstimate {
  estimatedCost: number;
  inputCost: number;
  outputCost: number;
}

interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * 估算请求费用
 */
export function estimateCost(
  inputPricePer1m: number,
  outputPricePer1m: number,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
): CostEstimate {
  const inputCost = Math.ceil((inputPricePer1m * estimatedInputTokens * UNITS_PER_CENT) / 1_000_000);
  const outputCost = Math.ceil((outputPricePer1m * estimatedOutputTokens * UNITS_PER_CENT) / 1_000_000);
  return {
    estimatedCost: inputCost + outputCost,
    inputCost,
    outputCost,
  };
}

/**
 * 检查用户余额是否足够
 */
export async function checkBalance(userId: string, requiredAmount: number): Promise<boolean> {
  const [account] = await db.select({ balance: userTokenAccounts.balance })
    .from(userTokenAccounts)
    .where(eq(userTokenAccounts.userId, userId));

  if (!account) return false;
  return (account.balance ?? 0) >= requiredAmount;
}

/**
 * 预扣用户余额
 * 返回新的余额和预扣意图ID
 */
export async function preDeduct(
  userId: string,
  estimatedCost: number,
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  const [account] = await db.select({ balance: userTokenAccounts.balance })
    .from(userTokenAccounts)
    .where(eq(userTokenAccounts.userId, userId));

  if (!account) {
    return { success: false, error: 'Token账户不存在' };
  }

  if ((account.balance ?? 0) < estimatedCost) {
    return { success: false, error: `余额不足，需要${estimatedCost}，当前余额${(account.balance ?? 0)}` };
  }

  const newBalance = (account.balance ?? 0) - estimatedCost;

  await db.update(userTokenAccounts)
    .set({
      balance: newBalance,
      updatedAt: new Date(),
    })
    .where(eq(userTokenAccounts.userId, userId));

  return { success: true, newBalance };
}

/**
 * 精确结算（退还差额）
 * 实际费用 = 实际输入token × 输入单价 + 实际输出token × 输出单价
 */
export async function finalizeCharge(
  userId: string,
  preDeductAmount: number,
  actualUsage: Usage,
  inputPricePer1m: number,
  outputPricePer1m: number,
): Promise<{ finalCost: number; refund: number }> {
  const actualCost = Math.ceil(
    (inputPricePer1m * actualUsage.inputTokens * UNITS_PER_CENT / 1_000_000) +
    (outputPricePer1m * actualUsage.outputTokens * UNITS_PER_CENT / 1_000_000),
  );

  const refund = preDeductAmount - actualCost;

  if (refund > 0) {
    // 退还差额
    await db.update(userTokenAccounts)
      .set({
        balance: sql`${userTokenAccounts.balance} + ${refund}`,
        totalConsumed: sql`${userTokenAccounts.totalConsumed} + ${actualCost}`,
        updatedAt: new Date(),
      })
      .where(eq(userTokenAccounts.userId, userId));
  } else if (refund < 0) {
    // 超出预扣，补扣（理论上很少发生）
    const extraCharge = Math.abs(refund);
    await db.update(userTokenAccounts)
      .set({
        balance: sql`${userTokenAccounts.balance} - ${extraCharge}`,
        totalConsumed: sql`${userTokenAccounts.totalConsumed} + ${actualCost}`,
        updatedAt: new Date(),
      })
      .where(eq(userTokenAccounts.userId, userId));
  } else {
    // 恰好一致
    await db.update(userTokenAccounts)
      .set({
        totalConsumed: sql`${userTokenAccounts.totalConsumed} + ${actualCost}`,
        updatedAt: new Date(),
      })
      .where(eq(userTokenAccounts.userId, userId));
  }

  return { finalCost: actualCost, refund };
}

/**
 * 失败退款 — 全额退还预扣金额
 */
export async function refundIntent(userId: string, amount: number): Promise<void> {
  await db.update(userTokenAccounts)
    .set({
      balance: sql`${userTokenAccounts.balance} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(userTokenAccounts.userId, userId));
}

async function getFreeModelDailyUsage(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [result] = await db.select({
    total: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.inputTokens} + ${tokenConsumptionLogs.outputTokens}), 0)`,
  }).from(tokenConsumptionLogs)
    .where(sql`${tokenConsumptionLogs.userId} = ${userId} AND ${tokenConsumptionLogs.createdAt} >= ${today.toISOString()} AND COALESCE(${tokenConsumptionLogs.cost}, 0) = 0`);

  return result?.total ?? 0;
}

/**
 * 获取用户Token账户
 */
export async function getAccount(userId: string) {
  const [account] = await db.select()
    .from(userTokenAccounts)
    .where(eq(userTokenAccounts.userId, userId));

  if (!account) return null;

  const role = await getUserRole(userId);
  const config = await getGroupConfig(role);
  const dailyLimit = config.dailyTokenLimit;
  const dailyUsed = await getFreeModelDailyUsage(userId);

  return {
    ...account,
    dailyLimit,
    dailyUsed,
  };
}

/**
 * 创建或确保Token账户存在
 * 新用户自动获得 5,000,000 初始额度
 */
export async function ensureAccount(userId: string): Promise<void> {
  const [existing] = await db.select({ id: userTokenAccounts.id })
    .from(userTokenAccounts)
    .where(eq(userTokenAccounts.userId, userId));

  if (!existing) {
    // 检查是否为管理员
    const [user] = await db.select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, userId));
    const initialBalance = user?.isAdmin ? 50_000_000 : 5_000_000;

    await db.insert(userTokenAccounts).values({
      userId,
      balance: initialBalance,
      dailyLimit: 10000000, // 每日限制 1000 万 token
    });
  }
}

// 每日流量限制（token数）按角色 — 从 user_groups 表动态读取
// 内存缓存，5分钟过期
interface GroupConfig {
  dailyTokenLimit: number;
  allowedModelGroups: string[];
}

let groupConfigCache: Record<string, GroupConfig> = {};
let groupConfigCacheTime = 0;
const GROUP_CONFIG_TTL = 5 * 60 * 1000; // 5 minutes

// 硬编码回退值（DB 不可用时使用）
const FALLBACK_LIMITS: Record<string, GroupConfig> = {
  free:   { dailyTokenLimit: 100_000, allowedModelGroups: ['default'] },
  paid:   { dailyTokenLimit: 500_000, allowedModelGroups: ['default', 'premium'] },
  tester: { dailyTokenLimit: 300_000, allowedModelGroups: ['default'] },
  admin:  { dailyTokenLimit: 0,       allowedModelGroups: ['default', 'premium'] },
};

async function loadGroupConfigs(): Promise<Record<string, GroupConfig>> {
  const now = Date.now();
  if (now - groupConfigCacheTime < GROUP_CONFIG_TTL && Object.keys(groupConfigCache).length > 0) {
    return groupConfigCache;
  }
  try {
    const rows = await db.select().from(userGroups);
    const map: Record<string, GroupConfig> = {};
    for (const row of rows) {
      map[row.name] = {
        dailyTokenLimit: Number(row.dailyTokenLimit ?? 100_000),
        allowedModelGroups: (row.allowedModelGroups as string[]) ?? ['default'],
      };
    }
    if (Object.keys(map).length > 0) {
      groupConfigCache = map;
      groupConfigCacheTime = now;
    }
    return Object.keys(map).length > 0 ? map : FALLBACK_LIMITS;
  } catch {
    return Object.keys(groupConfigCache).length > 0 ? groupConfigCache : FALLBACK_LIMITS;
  }
}

export async function getGroupConfig(roleName: string): Promise<GroupConfig> {
  const configs = await loadGroupConfigs();
  return configs[roleName] ?? configs['free'] ?? FALLBACK_LIMITS.free;
}

/**
 * 获取用户角色（综合 isAdmin + userRole + balance）
 */
export async function getUserRole(userId: string): Promise<string> {
  const [user] = await db.select({
    isAdmin: users.isAdmin,
    userRole: users.userRole,
  }).from(users).where(eq(users.id, userId));

  if (!user) return 'free';
  if (user.isAdmin) return 'admin';
  if (user.userRole === 'tester') return 'tester';

  // 检查是否有充值记录（balance > 0 或 totalRecharged > 0）
  const [account] = await db.select({
    balance: userTokenAccounts.balance,
    totalRecharged: userTokenAccounts.totalRecharged,
  }).from(userTokenAccounts).where(eq(userTokenAccounts.userId, userId));

  if (account && ((account.totalRecharged ?? 0) > 0 || (account.balance ?? 0) > 5_000_000)) {
    return 'paid';
  }

  return user.userRole || 'free';
}

/**
 * 查询模型在 model_pricing 中的 groupName
 * model 格式: "provider/modelId" 或纯 "modelId"
 */
async function getModelAccessMeta(model: string): Promise<{
  groupName: string;
  provider?: string;
  inputPricePer1m?: number;
  outputPricePer1m?: number;
  isFree: boolean;
}> {
  const parts = model.split('/');
  let provider: string | undefined;
  let modelId: string;
  if (parts.length >= 2) {
    provider = parts[0];
    modelId = parts.slice(1).join('/');
  } else {
    modelId = model;
  }

  const conditions = [eq(modelPricing.modelId, modelId), eq(modelPricing.isActive, true)];
  if (provider) conditions.push(eq(modelPricing.provider, provider));

  const [pricing] = await db.select({
    groupName: modelPricing.groupName,
    provider: modelPricing.provider,
    inputPricePer1m: modelPricing.inputPricePer1m,
    outputPricePer1m: modelPricing.outputPricePer1m,
  })
    .from(modelPricing)
    .where(and(...conditions))
    .limit(1);

  const inputPricePer1m = Number(pricing?.inputPricePer1m ?? 0);
  const outputPricePer1m = Number(pricing?.outputPricePer1m ?? 0);

  return {
    groupName: pricing?.groupName ?? 'default',
    provider: pricing?.provider,
    inputPricePer1m,
    outputPricePer1m,
    isFree: inputPricePer1m === 0 && outputPricePer1m === 0,
  };
}

/**
 * 检查用户是否可以使用指定模型
 * 基于 model_pricing.groupName 判断：
 *   default/all → 所有用户
 *   premium → 仅付费用户
 */
export async function checkModelAccess(userId: string, model: string): Promise<{ allowed: boolean; reason?: string; groupName?: string }> {
  const role = await getUserRole(userId);
  const { groupName, isFree } = await getModelAccessMeta(model);
  const config = await getGroupConfig(role);

  if (isFree || config.allowedModelGroups.includes(groupName)) {
    return { allowed: true, groupName };
  }

  const roleLabel = role === 'tester' ? '测试用户' : '免费用户';
  return {
    allowed: false,
    reason: `${roleLabel}仅可使用 LongCat 免费模型，充值后才能使用 DeepSeek、通义千问等收费模型`,
    groupName,
  };
}

/**
 * 检查每日Token使用限制（按角色）
 * 管理员：不限额
 * 付费用户使用付费模型时不限额
 */
export async function checkDailyLimit(userId: string, model?: string): Promise<{ allowed: boolean; dailyUsed: number; dailyLimit: number; role: string }> {
  const role = await getUserRole(userId);
  const config = await getGroupConfig(role);
  const dailyLimit = config.dailyTokenLimit;

  // dailyTokenLimit=0 表示不限额
  if (dailyLimit === 0) {
    return { allowed: true, dailyUsed: 0, dailyLimit: 0, role };
  }

  // 付费用户使用收费模型不受每日限制
  if (role === 'paid' && model) {
    const { isFree } = await getModelAccessMeta(model);
    if (!isFree) {
      return { allowed: true, dailyUsed: 0, dailyLimit, role };
    }
  }

  const dailyUsed = await getFreeModelDailyUsage(userId);
  return { allowed: dailyUsed < dailyLimit, dailyUsed, dailyLimit, role };
}
