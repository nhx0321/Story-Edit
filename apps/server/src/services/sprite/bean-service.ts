// 精灵豆核心服务 — 充值、消费、道具购买、升级进度计算
import { db } from '../../db';
import {
  userSprites, spriteItems, userSpriteItems, spriteBeanTransactions,
  rechargeOrders, users,
} from '../../db/schema';
import { eq, and, desc } from 'drizzle-orm';

// 升级所需经验值
const LEVEL_XP: Record<number, number> = {
  1: 50, 2: 100, 3: 150, 4: 200, 5: 250, 6: 300, 7: 400, 8: 500, 9: 800,
};
// 累计经验值
const CUMULATIVE_XP: Record<number, number> = {
  1: 50, 2: 150, 3: 300, 4: 500, 5: 750, 6: 1050, 7: 1450, 8: 1950, 9: 2750,
};

// 升级所需自然生长天数
const LEVEL_DAYS: Record<number, number> = {
  1: 7, 2: 21, 3: 42, 4: 63, 5: 91, 6: 119, 7: 154, 8: 196, 9: 259,
};

// 汇率：1元 = 100精灵豆
export const BEAN_RATE = 100;

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
 * 购买道具（消耗精灵豆）
 */
export async function purchaseItem(userId: string, itemCode: string) {
  const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, userId));
  if (!sprite?.isHatched) throw new Error('精灵尚未孵化');

  const [item] = await db.select().from(spriteItems).where(eq(spriteItems.code, itemCode));
  if (!item) throw new Error('道具不存在');
  if (!item.isActive) throw new Error('道具已下架');

  if ((sprite.beanBalance ?? 0) < item.price) {
    throw new Error('精灵豆余额不足');
  }

  await db.transaction(async (tx) => {
    const newBalance = (sprite.beanBalance ?? 0) - item.price;
    const newTotalSpent = (sprite.totalBeanSpent ?? 0) + item.price;
    const newTotalXp = (sprite.totalXp ?? 0) + item.price;

    await tx.update(userSprites).set({
      beanBalance: newBalance,
      totalBeanSpent: newTotalSpent,
      totalXp: newTotalXp,
      updatedAt: new Date(),
    }).where(eq(userSprites.userId, userId));

    // 记录流水
    await tx.insert(spriteBeanTransactions).values({
      userId,
      type: 'item_purchase',
      amount: -item.price,
      balanceAfter: newBalance,
      description: `购买道具 ${item.name}`,
      relatedType: 'item',
      relatedId: itemCode,
    });

    // 增加道具库存
    const [userItem] = await tx.select().from(userSpriteItems)
      .where(and(eq(userSpriteItems.userId, userId), eq(userSpriteItems.itemCode, itemCode)));

    if (userItem) {
      await tx.update(userSpriteItems).set({
        quantity: (userItem.quantity ?? 0) + 1,
        updatedAt: new Date(),
      }).where(eq(userSpriteItems.id, userItem.id));
    } else {
      await tx.insert(userSpriteItems).values({
        userId,
        itemCode,
        quantity: 1,
      });
    }
  });

  return { ok: true, itemName: item.name, itemIcon: item.icon };
}

/**
 * 使用道具（加速生长 + 获得经验值）
 */
export async function useItem(userId: string, itemCode: string) {
  const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, userId));
  if (!sprite?.isHatched) throw new Error('精灵尚未孵化');

  const [userItem] = await db.select().from(userSpriteItems)
    .where(and(eq(userSpriteItems.userId, userId), eq(userSpriteItems.itemCode, itemCode)));

  if (!userItem || (userItem.quantity ?? 0) <= 0) throw new Error('道具数量不足');

  const [item] = await db.select().from(spriteItems).where(eq(spriteItems.code, itemCode));
  if (!item) throw new Error('道具不存在');

  // 将道具效果（分钟）转换为天数，不足1天按1天算
  const daysToAdd = Math.max(1, Math.ceil(item.effectMinutes / 1440));

  await db.transaction(async (tx) => {
    await tx.update(userSpriteItems).set({
      quantity: (userItem.quantity ?? 0) - 1,
      updatedAt: new Date(),
    }).where(eq(userSpriteItems.id, userItem.id));

    await tx.update(userSprites).set({
      bonusDays: (sprite.bonusDays ?? 0) + daysToAdd,
      updatedAt: new Date(),
    }).where(eq(userSprites.userId, userId));
  });

  return { ok: true, itemName: item.name, daysAdded: daysToAdd, xpGained: item.price };
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

/**
 * 计算可兑换 VIP 天数
 * 每消耗 100 精灵豆 = 1 天可兑换
 */
export function getConvertibleDays(totalBeanSpent: number, convertedDays: number): number {
  return Math.floor(totalBeanSpent / 100) - convertedDays;
}
