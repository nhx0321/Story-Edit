// 订阅管理 tRPC 路由（已简化：取消免费/VIP 设置，功能全面开放）
import { z } from 'zod';
import { eq, desc, inArray } from 'drizzle-orm';
import { router, protectedProcedure, adminProcedure } from '../../trpc';
import { db } from '../../db';
import { subscriptions, subscriptionOrders, users } from '../../db/schema';

export const subscriptionRouter = router({
  // 获取当前订阅状态（保留用于显示，不再做功能限制）
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, ctx.userId));
    if (!sub) return { tier: 'free', isPremium: false, limits: null };

    const now = new Date();
    let isPremium = false;
    if (sub.status === 'premium' && sub.currentPeriodEnd && sub.currentPeriodEnd > now) {
      isPremium = true;
    }
    return {
      tier: isPremium ? 'premium' : 'free',
      isPremium,
      limits: null, // 不再做功能限制
    };
  }),

  // 签到奖励
  dailyCheckin: protectedProcedure.mutation(async () => {
    return { ok: true, message: '请使用 sprite.checkin 进行签到' };
  }),

  // ===== 管理员：历史订单查看（只读） =====

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

  adminGetRevenueStats: adminProcedure.query(async () => {
    return { message: '此端点已废弃', deprecated: true };
  }),
});
