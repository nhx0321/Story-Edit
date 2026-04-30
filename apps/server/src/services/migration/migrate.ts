// 用户迁移服务 — 旧体系（精灵豆+VIP）→ 新体系（Token账户）
import { db } from '../../db';
import { userSprites, userTokenAccounts, subscriptions, transactions, users } from '../../db/schema';
import { eq, isNull, and, sql } from 'drizzle-orm';
import { UNITS_PER_YUAN, UNITS_PER_CENT } from '../token-relay/token-billing';

// ========== 兑换比率 ==========

/** 精灵豆 → 内部单位: 1豆 = 1分 = 100,000单位 */
export const BEAN_TO_UNITS = UNITS_PER_CENT; // 100,000

/** VIP天数 → 内部单位: 1天 = 5,000,000单位 = 0.5元 */
export const VIP_DAY_TO_UNITS = UNITS_PER_YUAN / 2; // 5,000,000

// 用户迁移状态标记（存储在 userSprites 表或通过 migrated_at 时间戳判断）
// 在 users 表没有专用列的情况下，通过检查 token 账户的 totalRecharged 是否包含迁移记录来判断

/**
 * 为单个用户执行迁移
 * @returns { migrated: boolean, beanAmount: number, vipAmount: number, totalUnits: number }
 */
export async function migrateUser(userId: string): Promise<{
  migrated: boolean;
  beanAmount: number;
  vipAmount: number;
  totalUnits: number;
  alreadyMigrated: boolean;
}> {
  // 检查是否已迁移过（检查 transactions 中是否有 migration 类型的记录）
  const [existingMigration] = await db.select({ id: transactions.id })
    .from(transactions)
    .where(and(
      eq(transactions.userId, userId),
      eq(transactions.type, 'migration'),
    ))
    .limit(1);

  if (existingMigration) {
    return { migrated: false, beanAmount: 0, vipAmount: 0, totalUnits: 0, alreadyMigrated: true };
  }

  const [sprite] = await db.select({ beanBalance: userSprites.beanBalance })
    .from(userSprites)
    .where(eq(userSprites.userId, userId));

  const [sub] = await db.select({ currentPeriodEnd: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));

  const beanBalance = sprite?.beanBalance ?? 0;
  const beanUnits = beanBalance * BEAN_TO_UNITS;

  let vipDays = 0;
  if (sub?.currentPeriodEnd) {
    const now = new Date();
    const endDate = new Date(sub.currentPeriodEnd);
    if (endDate > now) {
      const msRemaining = endDate.getTime() - now.getTime();
      vipDays = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
    }
  }
  const vipUnits = vipDays * VIP_DAY_TO_UNITS;

  const totalUnits = beanUnits + vipUnits;

  if (totalUnits <= 0) {
    // 无需迁移（没有可转换的资产）
    // 仍然标记为已迁移，避免后续重复检查
    await db.insert(transactions).values({
      userId,
      type: 'migration',
      amount: 0,
      description: '资产迁移：无可转换资产（精灵豆=0，VIP剩余=0天）',
      status: 'completed',
      metadata: { beanBalance: 0, vipDays: 0, totalUnits: 0 },
    });
    return { migrated: true, beanAmount: 0, vipAmount: 0, totalUnits: 0, alreadyMigrated: false };
  }

  // 确保 Token 账户存在
  const [existingAccount] = await db.select({ id: userTokenAccounts.id })
    .from(userTokenAccounts)
    .where(eq(userTokenAccounts.userId, userId));

  if (!existingAccount) {
    await db.insert(userTokenAccounts).values({
      userId,
      balance: totalUnits,
      totalRecharged: totalUnits,
      totalConsumed: 0,
    });
  } else {
    await db.update(userTokenAccounts)
      .set({
        balance: sql`${userTokenAccounts.balance} + ${totalUnits}`,
        totalRecharged: sql`${userTokenAccounts.totalRecharged} + ${totalUnits}`,
        updatedAt: new Date(),
      })
      .where(eq(userTokenAccounts.userId, userId));
  }

  // 记录迁移交易
  await db.insert(transactions).values({
    userId,
    type: 'migration',
    amount: totalUnits,
    description: `资产迁移：精灵豆${beanBalance}个→${beanUnits}单位 + VIP${vipDays}天→${vipUnits}单位，合计${totalUnits}单位`,
    status: 'completed',
    metadata: {
      beanBalance,
      beanUnits,
      vipDays,
      vipUnits,
      totalUnits,
      conversionRates: {
        beanToUnits: BEAN_TO_UNITS,
        vipDayToUnits: VIP_DAY_TO_UNITS,
      },
    },
  });

  // 精灵豆余额归零（已转换）
  if (beanBalance > 0) {
    await db.update(userSprites)
      .set({ beanBalance: 0, updatedAt: new Date() })
      .where(eq(userSprites.userId, userId));
  }

  return {
    migrated: true,
    beanAmount: beanUnits,
    vipAmount: vipUnits,
    totalUnits,
    alreadyMigrated: false,
  };
}

/**
 * 批量迁移所有未迁移用户
 */
export async function migrateAllUsers(): Promise<{
  total: number;
  migrated: number;
  skipped: number;
  totalUnits: number;
}> {
  // 查找所有有精灵豆或VIP的用户
  const allSprites = await db.select({ userId: userSprites.userId, beanBalance: userSprites.beanBalance })
    .from(userSprites);

  const allSubs = await db.select({ userId: subscriptions.userId, currentPeriodEnd: subscriptions.currentPeriodEnd })
    .from(subscriptions);

  // 获取所有需要检查的用户
  const userIds = new Set<string>();
  for (const s of allSprites) {
    if ((s.beanBalance ?? 0) > 0) userIds.add(s.userId);
  }

  const now = new Date();
  for (const s of allSubs) {
    if (s.currentPeriodEnd && new Date(s.currentPeriodEnd) > now) {
      userIds.add(s.userId);
    }
  }

  let migrated = 0;
  let skipped = 0;
  let totalUnits = 0;

  for (const userId of userIds) {
    try {
      const result = await migrateUser(userId);
      if (result.alreadyMigrated) {
        skipped++;
      } else {
        migrated++;
        totalUnits += result.totalUnits;
      }
    } catch (err) {
      console.error(`Migration failed for user ${userId}:`, err);
    }
  }

  return { total: userIds.size, migrated, skipped, totalUnits };
}

/**
 * 获取迁移统计
 */
export async function getMigrationStats(): Promise<{
  totalUsers: number;
  migratedUsers: number;
  pendingUsers: number;
  totalBeansMigrated: number;
  totalVipDaysMigrated: number;
  totalUnitsMigrated: number;
}> {
  const [totalRow] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
  const totalUsers = totalRow?.count ?? 0;

  // 已迁移用户数（有 migration 类型交易的用户）
  const [migratedRow] = await db.select({
    count: sql<number>`COUNT(DISTINCT ${transactions.userId})`,
  }).from(transactions)
    .where(eq(transactions.type, 'migration'));

  const migratedUsers = migratedRow?.count ?? 0;
  const pendingUsers = Math.max(0, totalUsers - migratedUsers);

  // 迁移总量统计
  const migrationRecords = await db.select({ metadata: transactions.metadata })
    .from(transactions)
    .where(eq(transactions.type, 'migration'));

  let totalBeansMigrated = 0;
  let totalVipDaysMigrated = 0;
  let totalUnitsMigrated = 0;

  for (const record of migrationRecords) {
    const meta = record.metadata as any;
    if (meta) {
      totalBeansMigrated += meta.beanBalance ?? 0;
      totalVipDaysMigrated += meta.vipDays ?? 0;
      totalUnitsMigrated += meta.totalUnits ?? 0;
    }
  }

  return {
    totalUsers,
    migratedUsers,
    pendingUsers,
    totalBeansMigrated,
    totalVipDaysMigrated,
    totalUnitsMigrated,
  };
}

/**
 * 检查用户迁移状态
 */
export async function getUserMigrationStatus(userId: string): Promise<{
  migrated: boolean;
  beanBalance: number;
  vipDaysRemaining: number;
  estimatedUnits: number;
}> {
  const [existingMigration] = await db.select({ id: transactions.id })
    .from(transactions)
    .where(and(
      eq(transactions.userId, userId),
      eq(transactions.type, 'migration'),
    ))
    .limit(1);

  const [sprite] = await db.select({ beanBalance: userSprites.beanBalance })
    .from(userSprites)
    .where(eq(userSprites.userId, userId));

  const [sub] = await db.select({ currentPeriodEnd: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));

  const beanBalance = sprite?.beanBalance ?? 0;
  let vipDays = 0;
  if (sub?.currentPeriodEnd) {
    const endDate = new Date(sub.currentPeriodEnd);
    if (endDate > new Date()) {
      vipDays = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }
  }

  return {
    migrated: !!existingMigration,
    beanBalance,
    vipDaysRemaining: vipDays,
    estimatedUnits: beanBalance * BEAN_TO_UNITS + vipDays * VIP_DAY_TO_UNITS,
  };
}
