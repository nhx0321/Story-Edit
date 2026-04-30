// 精灵豆 tRPC 路由（简化版 — 移除VIP兑换和道具消费，仅保留模板市场用豆）
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../../trpc';
import { db } from '../../db';
import { userSprites, rechargeOrders } from '../../db/schema';
import {
  getLevelProgress, createRechargeOrder,
  confirmRechargePayment,
  getBeanBalanceAndTransactions, getLevelByXp,
  recordBeanTransaction, BEAN_RATE,
} from '../sprite/bean-service';
import { userTokenAccounts } from '../../db/schema';
import { UNITS_PER_YUAN } from '../token-relay/token-billing';

// 升级所需天数（与原有逻辑一致）
const LEVEL_DAYS: Record<number, number> = {
  1: 0, 2: 26, 3: 58, 4: 96, 5: 140, 6: 190, 7: 245, 8: 305, 9: 365,
};

export const spriteBeanRouter = router({
  // 查询精灵豆余额和流水
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    return getBeanBalanceAndTransactions(ctx.userId);
  }),

  // 创建充值订单（元→豆，1元=100豆）
  recharge: protectedProcedure
    .input(z.object({
      amountYuan: z.number().min(1),
      paymentMethod: z.enum(['wechat', 'alipay']),
    }))
    .mutation(async ({ ctx, input }) => {
      const order = await createRechargeOrder(ctx.userId, input.amountYuan, input.paymentMethod);
      return {
        orderId: order.id,
        amountCents: order.amountCents,
        beanAmount: order.beanAmount,
        paymentMethod: order.paymentMethod,
        status: order.status,
      };
    }),

  // 确认支付回调，发放精灵豆
  confirmPayment: protectedProcedure
    .input(z.object({
      orderId: z.string().uuid(),
      transactionId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return confirmRechargePayment(input.orderId, input.transactionId);
    }),

  // 查询用户充值订单列表
  getMyOrders: protectedProcedure.query(async ({ ctx }) => {
    const orders = await db.select()
      .from(rechargeOrders)
      .where(eq(rechargeOrders.userId, ctx.userId))
      .orderBy(desc(rechargeOrders.createdAt))
      .limit(20);

    return orders.map(o => ({
      id: o.id,
      amountCents: o.amountCents,
      beanAmount: o.beanAmount,
      paymentMethod: o.paymentMethod,
      status: o.status,
      createdAt: o.createdAt,
    }));
  }),

  // 查询升级进度（剩余经验/天数）
  getLevelProgress: protectedProcedure.query(async ({ ctx }) => {
    const [sprite] = await db.select().from(userSprites).where(eq(userSprites.userId, ctx.userId));
    if (!sprite?.isHatched) throw new TRPCError({ code: 'NOT_FOUND', message: '精灵尚未孵化' });

    const totalDays = (sprite.totalActiveDays ?? 0) + (sprite.bonusDays ?? 0) + (sprite.convertedDays ?? 0);
    const totalXp = sprite.totalXp ?? 0;

    let xpLevel = getLevelByXp(totalXp);
    let daysLevel = 1;
    for (let lvl = 9; lvl >= 1; lvl--) {
      if (totalDays >= LEVEL_DAYS[lvl]) { daysLevel = lvl; break; }
    }
    const currentLevel = Math.min(xpLevel, daysLevel);

    const progress = getLevelProgress(
      currentLevel,
      totalXp,
      sprite.totalActiveDays ?? 0,
      sprite.bonusDays ?? 0,
      sprite.convertedDays ?? 0,
    );

    return {
      ...progress,
      beanBalance: sprite.beanBalance ?? 0,
      totalBeanSpent: sprite.totalBeanSpent ?? 0,
      totalXp,
      convertedDays: sprite.convertedDays ?? 0,
    };
  }),

  // 余额→精灵豆兑换（1元=100豆，从Token余额扣除）
  exchangeBalanceToBeans: protectedProcedure
    .input(z.object({ amountYuan: z.number().min(1).max(10000).int() }))
    .mutation(async ({ ctx, input }) => {
      const beanAmount = input.amountYuan * BEAN_RATE;
      const tokenCost = input.amountYuan * UNITS_PER_YUAN;

      // 扣Token余额
      const [account] = await db.select({ balance: userTokenAccounts.balance })
        .from(userTokenAccounts)
        .where(eq(userTokenAccounts.userId, ctx.userId));
      if (!account || (account.balance ?? 0) < tokenCost) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Token余额不足' });
      }
      await db.update(userTokenAccounts)
        .set({ balance: (account.balance ?? 0) - tokenCost, updatedAt: new Date() })
        .where(eq(userTokenAccounts.userId, ctx.userId));

      // 加精灵豆
      const newBeanBalance = await recordBeanTransaction({
        userId: ctx.userId,
        type: 'recharge',
        amount: beanAmount,
        description: `余额兑换 ${beanAmount} 精灵豆（${input.amountYuan}元）`,
      });

      return { beanAmount, newBeanBalance };
    }),

  // 精灵豆→余额兑换（100豆=1元，转入Token余额，最小1精灵豆）
  exchangeBeansToBalance: protectedProcedure
    .input(z.object({ beanAmount: z.number().min(1).int() }))
    .mutation(async ({ ctx, input }) => {
      const amountYuan = input.beanAmount / BEAN_RATE;
      const tokenAmount = amountYuan * UNITS_PER_YUAN;

      // 扣精灵豆
      const newBeanBalance = await recordBeanTransaction({
        userId: ctx.userId,
        type: 'consume',
        amount: -input.beanAmount,
        description: `精灵豆兑换余额 ${input.beanAmount} 豆 → ${amountYuan}元`,
      });

      // 加Token余额
      const [account] = await db.select({ balance: userTokenAccounts.balance })
        .from(userTokenAccounts)
        .where(eq(userTokenAccounts.userId, ctx.userId));
      if (!account) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Token账户不存在' });
      }
      await db.update(userTokenAccounts)
        .set({ balance: (account.balance ?? 0) + tokenAmount, updatedAt: new Date() })
        .where(eq(userTokenAccounts.userId, ctx.userId));

      return { tokenAmount, newBeanBalance };
    }),

  // ===== 管理员端 =====

  // 收入统计（精灵豆维度）
  adminGetRevenueStats: adminProcedure.query(async () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // 充值订单统计
    const allOrders = await db.select()
      .from(rechargeOrders)
      .where(eq(rechargeOrders.status, 'paid'));

    const calcStats = (orders: typeof allOrders) => {
      const totalBeans = orders.reduce((s, o) => s + o.beanAmount, 0);
      const totalAmount = orders.reduce((s, o) => s + o.amountCents, 0);
      return {
        orderCount: orders.length,
        totalBeans,
        totalAmountCents: totalAmount,
        totalAmountYuan: totalAmount / 100,
      };
    };

    const todayOrders = allOrders.filter(o => o.createdAt >= todayStart);
    const monthOrders = allOrders.filter(o => o.createdAt >= monthStart);
    const yearOrders = allOrders.filter(o => o.createdAt >= yearStart);

    // 按支付方式统计
    const paymentStats: Record<string, { count: number; beans: number; amount: number }> = {};
    for (const o of allOrders) {
      const method = o.paymentMethod || 'unknown';
      if (!paymentStats[method]) paymentStats[method] = { count: 0, beans: 0, amount: 0 };
      paymentStats[method].count++;
      paymentStats[method].beans += o.beanAmount;
      paymentStats[method].amount += o.amountCents;
    }

    return {
      today: calcStats(todayOrders),
      month: calcStats(monthOrders),
      year: calcStats(yearOrders),
      total: calcStats(allOrders),
      paymentStats,
    };
  }),
});
