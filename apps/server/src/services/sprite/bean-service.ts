// 精灵豆核心服务 — 充值、流水、升级进度（道具购买/使用已移除）
import { db } from '../../db';
import {
  userSprites, spriteBeanTransactions,
  rechargeOrders,
} from '../../db/schema';
import { eq, desc } from 'drizzle-orm';

// 升级所需经验值（单级）
const LEVEL_XP: Record<number, number> = {
  1: 150, 2: 300, 3: 450, 4: 600, 5: 750, 6: 900, 7: 1200, 8: 1500, 9: 2400,
};
// 累计经验值
const CUMULATIVE_XP: Record<number, number> = {
  1: 150, 2: 450, 3: 900, 4: 1500, 5: 2250, 6: 3150, 7: 4350, 8: 5850, 9: 8250,
};

// 升级所需自然生长天数
const LEVEL_DAYS: Record<number, number> = {
  1: 7, 2: 21, 3: 42, 4: 63, 5: 91, 6: 119, 7: 154, 8: 196, 9: 259,
};

// 汇率：1元 = 100精灵豆
export const BEAN_RATE = 100;

export async function ensureUserSprite(userId: string) {
  const [existing] = await db.select({ id: userSprites.id })
    .from(userSprites)
    .where(eq(userSprites.userId, userId));

  if (existing) return existing;

  const [created] = await db.insert(userSprites).values({
    userId,
    level: 1,
    customName: null,
    isHatched: false,
    guideStep: 0,
    beanBalance: 0,
    totalBeanSpent: 0,
    totalXp: 0,
  }).returning({ id: userSprites.id });

  return created;
}

export interface BeanTransaction {
  userId: string;
  type: 'recharge' | 'consume' | 'earn' | 'item_purchase' | 'refund' | 'admin_adjust' | 'income';
  amount: number;
  description?: string;
  relatedType?: string;
  relatedId?: string;
}

/**
 * 根据经验值计算精灵等级
 */
export function getLevelByXp(totalXp: number): number {
  let level = 1;
  let cumulative = 0;
  for (let lvl = 1; lvl <= 9; lvl++) {
    cumulative += LEVEL_XP[lvl] || 0;
    if (totalXp >= cumulative) {
      level = lvl + 1;
    } else {
      break;
    }
  }
  return Math.min(level, 9);
}

/**
 * 计算升级进度（经验值+天数双条件）
 */
export function getLevelProgress(level: number, totalXp: number,
  totalActiveDays: number, bonusDays: number, convertedDays: number) {
  if (level >= 9) {
    return {
      currentLevel: 9, maxLevel: true,
      xpNeeded: 0, daysNeeded: 0,
      xpProgress: `${CUMULATIVE_XP[9]}/${CUMULATIVE_XP[9]}`,
      daysProgress: '365/365',
      xpConditionMet: true, daysConditionMet: true,
    };
  }

  const nextLevel = level + 1;
  const xpNeeded = Math.max(0, CUMULATIVE_XP[nextLevel] - totalXp);
  const currentTotalDays = (totalActiveDays ?? 0) + (bonusDays ?? 0) + (convertedDays ?? 0);
  const daysNeeded = Math.max(0, LEVEL_DAYS[nextLevel] - currentTotalDays);

  return {
    currentLevel: level,
    maxLevel: false,
    xpNeeded,
    daysNeeded,
    xpProgress: `${totalXp}/${CUMULATIVE_XP[nextLevel]}`,
    daysProgress: `${currentTotalDays}/${LEVEL_DAYS[nextLevel]}`,
    xpConditionMet: totalXp >= CUMULATIVE_XP[nextLevel],
    daysConditionMet: currentTotalDays >= LEVEL_DAYS[nextLevel],
  };
}

/**
 * 记录精灵豆流水并更新余额和经验值
 */
export async function recordBeanTransaction(tx: BeanTransaction): Promise<number> {
  await ensureUserSprite(tx.userId);

  // 获取当前余额
  const [sprite] = await db.select({
    beanBalance: userSprites.beanBalance,
    totalBeanSpent: userSprites.totalBeanSpent,
    totalXp: userSprites.totalXp,
  })
    .from(userSprites)
    .where(eq(userSprites.userId, tx.userId));

  if (!sprite) throw new Error('精灵不存在');

  const newBalance = (sprite.beanBalance ?? 0) + tx.amount;
  if (newBalance < 0) throw new Error('精灵豆余额不足');

  // 插入流水记录
  await db.insert(spriteBeanTransactions).values({
    userId: tx.userId,
    type: tx.type,
    amount: tx.amount,
    balanceAfter: newBalance,
    description: tx.description,
    relatedType: tx.relatedType,
    relatedId: tx.relatedId,
  });

  // 更新余额和经验值
  const updates: Record<string, number> = {
    beanBalance: newBalance,
  };
  if (tx.amount < 0) {
    const absAmount = Math.abs(tx.amount);
    updates.totalBeanSpent = (sprite.totalBeanSpent ?? 0) + absAmount;
    updates.totalXp = (sprite.totalXp ?? 0) + absAmount;
  }

  await db.update(userSprites)
    .set(updates)
    .where(eq(userSprites.userId, tx.userId));

  return newBalance;
}

/**
 * 创建充值订单
 */
export async function createRechargeOrder(userId: string, amountYuan: number, paymentMethod: 'wechat' | 'alipay') {
  const beanAmount = Math.floor(amountYuan * BEAN_RATE);
  const amountCents = amountYuan * 100;

  const [order] = await db.insert(rechargeOrders).values({
    userId,
    amountCents,
    beanAmount,
    paymentMethod,
    status: 'pending',
  }).returning();

  return order;
}

/**
 * 确认支付成功，发放精灵豆
 */
export async function confirmRechargePayment(orderId: string, transactionId?: string) {
  const [order] = await db.select().from(rechargeOrders).where(eq(rechargeOrders.id, orderId));
  if (!order) throw new Error('订单不存在');
  if (order.status === 'paid') throw new Error('订单已支付');

  await ensureUserSprite(order.userId);

  await db.transaction(async (tx) => {
    // 更新订单状态
    await tx.update(rechargeOrders)
      .set({ status: 'paid', transactionId: transactionId || order.transactionId, updatedAt: new Date() })
      .where(eq(rechargeOrders.id, orderId));

    // 发放精灵豆
    const [sprite] = await tx.select({ beanBalance: userSprites.beanBalance })
      .from(userSprites)
      .where(eq(userSprites.userId, order.userId));

    if (sprite) {
      const newBalance = (sprite.beanBalance ?? 0) + order.beanAmount;
      await tx.insert(spriteBeanTransactions).values({
        userId: order.userId,
        type: 'recharge',
        amount: order.beanAmount,
        balanceAfter: newBalance,
        description: `充值 ${order.beanAmount} 精灵豆`,
        relatedType: 'order',
        relatedId: orderId,
      });
      await tx.update(userSprites)
        .set({ beanBalance: newBalance })
        .where(eq(userSprites.userId, order.userId));
    }
  });

  return { ok: true, beanAmount: order.beanAmount };
}

/**
 * 获取精灵豆余额和流水
 */
export async function getBeanBalanceAndTransactions(userId: string, limit = 20) {
  const [sprite] = await db.select({
    beanBalance: userSprites.beanBalance,
    totalBeanSpent: userSprites.totalBeanSpent,
    totalXp: userSprites.totalXp,
    convertedDays: userSprites.convertedDays,
  }).from(userSprites).where(eq(userSprites.userId, userId));

  if (!sprite) return { beanBalance: 0, totalBeanSpent: 0, totalXp: 0, convertedDays: 0, transactions: [] };

  const transactions = await db.select()
    .from(spriteBeanTransactions)
    .where(eq(spriteBeanTransactions.userId, userId))
    .orderBy(desc(spriteBeanTransactions.createdAt))
    .limit(limit);

  return {
    beanBalance: sprite.beanBalance ?? 0,
    totalBeanSpent: sprite.totalBeanSpent ?? 0,
    totalXp: sprite.totalXp ?? 0,
    convertedDays: sprite.convertedDays ?? 0,
    transactions,
  };
}

