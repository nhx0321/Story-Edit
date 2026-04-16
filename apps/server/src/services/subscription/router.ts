// 订阅管理 tRPC 路由 — 已简化（改为精灵豆体系）
// 旧的 subscription/createOrder、adminRefundOrder 等端点已废弃
// 请使用 spriteBean.recharge、spriteBean.confirmPayment 等替代
import { z } from 'zod';
import { eq, desc, sql, inArray } from 'drizzle-orm';
import { router, publicProcedure, protectedProcedure, adminProcedure } from '../../trpc';
import { db } from '../../db';
import { subscriptions, subscriptionOrders, users } from '../../db/schema';
import { getFeatureLimits, type SubscriptionTier } from './gate';

export const subscriptionRouter = router({
  // 获取当前订阅状态（改为返回 free，不再依赖 trial/premium）
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, ctx.userId));
    if (!sub) return { tier: 'free' as SubscriptionTier, isPremium: false, trialDaysLeft: 0, limits: getFeatureLimits('free') };

    // 旧逻辑保留兼容，但不再生效
    const now = new Date();
    let tier: SubscriptionTier = 'free';
    let isPremium = false;
    let trialDaysLeft = 0;

    if (sub.status === 'trial' && sub.trialEndsAt) {
      trialDaysLeft = Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      if (trialDaysLeft > 0) { tier = 'trial'; isPremium = true; }
    } else if (sub.status === 'premium' && sub.currentPeriodEnd && sub.currentPeriodEnd > now) {
      tier = 'premium'; isPremium = true;
    }

    return { tier, isPremium, trialDaysLeft, limits: getFeatureLimits(tier) };
  }),

  // 签到奖励改为精灵豆（替代 trial_days）
  dailyCheckin: protectedProcedure.mutation(async ({ ctx }) => {
    // 此端点已被 sprite.checkin 替代
    // 保留空实现以避免前端报错
    return { ok: true, message: '请使用 sprite.checkin 进行签到' };
  }),

  // ===== 管理员：历史订单查看（只读，不再允许操作） =====

  // 获取订单列表（只读）
  adminListOrders: adminProcedure.query(async () => {
    const orders = await db.select({
      id: subscriptionOrders.id,
      userId: subscriptionOrders.userId,
      plan: subscriptionOrders.plan,
      amount: subscriptionOrders.amount,
      paymentMethod: subscriptionOrders.paymentMethod,
      status: subscriptionOrders.status,
      refundAmount: subscriptionOrders.refundAmount,
      transactionId: subscriptionOrders.transactionId,
      createdAt: subscriptionOrders.createdAt,
      updatedAt: subscriptionOrders.updatedAt,
    })
      .from(subscriptionOrders)
      .orderBy(desc(subscriptionOrders.createdAt))
      .limit(100);

    // 批量查询用户信息
    const userIds = [...new Set(orders.map(o => o.userId))];
    const userList = userIds.length > 0
      ? await db.select({ id: users.id, nickname: users.nickname, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
    const userMap = new Map(userList.map(u => [u.id, u]));

    return orders.map(o => ({
      ...o,
      user: userMap.get(o.userId) || null,
    }));
  }),

  // 收入统计（已迁移到 spriteBean.adminGetRevenueStats）
  adminGetRevenueStats: adminProcedure.query(async () => {
    return {
      message: '此端点已废弃，请使用 spriteBean.adminGetRevenueStats',
      deprecated: true,
    };
  }),
});
