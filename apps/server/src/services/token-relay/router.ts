// Token Relay tRPC 路由
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure, adminProcedureLevel } from '../../trpc';
import { db } from '../../db';
import { eq, desc, sql, and } from 'drizzle-orm';
import {
  apiChannels, modelPricing, userTokenAccounts,
  tokenConsumptionLogs, tokenPackages, userApiKeys, users,
  tokenRechargeOrders, userSubscriptions, systemSettings, userGroups,
} from '../../db/schema';
import * as channelManager from './channel-manager';
import * as tokenBilling from './token-billing';
import * as apiKeyService from './api-key-service';
import * as pricingService from './model-pricing';
import * as consumptionTracker from './consumption-tracker';
import { encryptApiKey } from '../ai-gateway/crypto';

export const tokenRelayRouter = router({
  // ===== 用户端 =====

  // 获取Token账户
  getAccount: protectedProcedure.query(async ({ ctx }) => {
    await tokenBilling.ensureAccount(ctx.userId);
    return tokenBilling.getAccount(ctx.userId);
  }),

  // 获取用户首选模型
  getPreferredModel: protectedProcedure.query(async ({ ctx }) => {
    await tokenBilling.ensureAccount(ctx.userId);
    const [account] = await db.select({ preferredModel: userTokenAccounts.preferredModel })
      .from(userTokenAccounts).where(eq(userTokenAccounts.userId, ctx.userId));
    return { preferredModel: account?.preferredModel || null };
  }),

  // 设置用户首选模型
  setPreferredModel: protectedProcedure
    .input(z.object({ modelId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await tokenBilling.ensureAccount(ctx.userId);

      if (input.modelId) {
        const access = await tokenBilling.checkModelAccess(ctx.userId, input.modelId);
        if (!access.allowed) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: access.reason || '当前账号无权使用该模型',
          });
        }
      }

      await db.update(userTokenAccounts)
        .set({ preferredModel: input.modelId, updatedAt: new Date() })
        .where(eq(userTokenAccounts.userId, ctx.userId));
      return { ok: true };
    }),

  // 获取消费记录
  getConsumption: protectedProcedure
    .input(z.object({
      limit: z.number().default(50),
      offset: z.number().default(0),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return consumptionTracker.getUserConsumption(ctx.userId, {
        limit: input.limit,
        offset: input.offset,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      });
    }),

  // 获取消费统计
  getConsumptionStats: protectedProcedure.query(async ({ ctx }) => {
    return consumptionTracker.getUserConsumptionStats(ctx.userId);
  }),

  // 设置预警阈值
  setAlertThreshold: protectedProcedure
    .input(z.object({ threshold: z.number(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(userTokenAccounts)
        .set({ alertThreshold: input.threshold, alertEnabled: input.enabled })
        .where(eq(userTokenAccounts.userId, ctx.userId));
      return { ok: true };
    }),

  // API Key 管理
  createApiKey: protectedProcedure
    .input(z.object({ name: z.string().min(1), rateLimitPerMin: z.number().default(60) }))
    .mutation(async ({ ctx, input }) => {
      const { fullKey, keyPrefix } = await apiKeyService.createKey(
        ctx.userId, input.name, input.rateLimitPerMin,
      );
      return { key: fullKey, prefix: keyPrefix };
    }),

  listApiKeys: protectedProcedure.query(async ({ ctx }) => {
    return apiKeyService.listKeys(ctx.userId);
  }),

  revokeApiKey: protectedProcedure
    .input(z.object({ keyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return apiKeyService.revokeKey(ctx.userId, input.keyId);
    }),

  // ===== 模型定价查询 =====

  getAllModels: protectedProcedure.query(async ({ ctx }) => {
    const role = await tokenBilling.getUserRole(ctx.userId);
    const models = await pricingService.getAllPricing();

    return models.map(model => {
      const inputPricePer1m = Number(model.inputPricePer1m ?? 0);
      const outputPricePer1m = Number(model.outputPricePer1m ?? 0);
      const isFree = inputPricePer1m === 0 && outputPricePer1m === 0;
      const isPremium = model.groupName === 'premium';
      const canAccess = isFree || (!isPremium) || role === 'paid' || role === 'admin';

      return {
        ...model,
        inputPricePer1m,
        outputPricePer1m,
        isFree,
        canAccess,
      };
    });
  }),

  // 获取可用套餐（用户端）
  getPackages: protectedProcedure.query(async () => {
    return db.select().from(tokenPackages).where(eq(tokenPackages.isActive, true));
  }),

  // 获取当前订阅
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const [sub] = await db.select().from(userSubscriptions)
      .where(and(
        eq(userSubscriptions.userId, ctx.userId),
        eq(userSubscriptions.status, 'active'),
      ))
      .orderBy(desc(userSubscriptions.createdAt))
      .limit(1);
    if (!sub) return null;
    const pkg = sub.packageId
      ? (await db.select().from(tokenPackages).where(eq(tokenPackages.id, sub.packageId)))[0]
      : null;
    return { ...sub, packageName: pkg?.name || null };
  }),

  // 创建充值订单
  createRechargeOrder: protectedProcedure
    .input(z.object({
      packageId: z.string().uuid(),
      paymentMethod: z.enum(['wechat', 'alipay']),
    }))
    .mutation(async ({ ctx, input }) => {
      const pkg = await db.select().from(tokenPackages)
        .where(eq(tokenPackages.id, input.packageId));
      if (!pkg[0]) throw new TRPCError({ code: 'NOT_FOUND', message: '套餐不存在' });
      if (!pkg[0].isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: '套餐已下架' });

      const [order] = await db.insert(tokenRechargeOrders).values({
        userId: ctx.userId,
        packageId: input.packageId,
        amountCents: pkg[0].priceCents,
        tokenAmount: pkg[0].tokenQuota,
        paymentMethod: input.paymentMethod,
        status: 'pending',
      }).returning();

      return { orderId: order.id, amountCents: order.amountCents };
    }),

  // 固定档位充值订单（仅允许预设金额）
  createCustomRechargeOrder: protectedProcedure
    .input(z.object({
      amountYuan: z.number().int().refine(v => [10, 50, 100, 300].includes(v), {
        message: '仅支持 10/50/100/300 元固定档位充值',
      }),
      paymentMethod: z.enum(['wechat', 'alipay']),
    }))
    .mutation(async ({ ctx, input }) => {
      const UNITS_PER_YUAN = 10_000_000;
      const tokenAmount = input.amountYuan * UNITS_PER_YUAN;
      const [order] = await db.insert(tokenRechargeOrders).values({
        userId: ctx.userId,
        packageId: null,
        amountCents: input.amountYuan * 100,
        tokenAmount,
        paymentMethod: input.paymentMethod,
        status: 'pending',
      }).returning();

      return { orderId: order.id, amountCents: order.amountCents };
    }),

  // 确认支付（固定金额收款码，金额由码本身保证）
  confirmRechargePayment: protectedProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existingOrder] = await db.select().from(tokenRechargeOrders)
        .where(and(
          eq(tokenRechargeOrders.id, input.orderId),
          eq(tokenRechargeOrders.userId, ctx.userId),
        ));
      if (!existingOrder) throw new TRPCError({ code: 'NOT_FOUND', message: '订单不存在' });

      const [order] = await db.update(tokenRechargeOrders)
        .set({ status: 'paid', paidAt: new Date() })
        .where(and(
          eq(tokenRechargeOrders.id, input.orderId),
          eq(tokenRechargeOrders.userId, ctx.userId),
          eq(tokenRechargeOrders.status, 'pending'),
        ))
        .returning();

      if (!order) {
        if (existingOrder.status === 'paid') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '订单已支付' });
        }
        throw new TRPCError({ code: 'BAD_REQUEST', message: '订单状态不可确认' });
      }

      // 发放Token额度
      await tokenBilling.ensureAccount(ctx.userId);
      await db.update(userTokenAccounts)
        .set({
          balance: sql`${userTokenAccounts.balance} + ${order.tokenAmount}`,
          totalRecharged: sql`${userTokenAccounts.totalRecharged} + ${order.tokenAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(userTokenAccounts.userId, ctx.userId));

      // 订阅类套餐：管理订阅状态
      const pkg = order.packageId
        ? (await db.select().from(tokenPackages).where(eq(tokenPackages.id, order.packageId)))[0]
        : null;

      if (pkg && pkg.type === 'subscription' && pkg.durationDays) {
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + pkg.durationDays);

        const [existingSub] = await db.select().from(userSubscriptions)
          .where(and(
            eq(userSubscriptions.userId, ctx.userId),
            eq(userSubscriptions.status, 'active'),
          ));

        if (existingSub?.expiresAt && existingSub.expiresAt > now) {
          const newExpiry = new Date(existingSub.expiresAt);
          newExpiry.setDate(newExpiry.getDate() + pkg.durationDays);
          await db.update(userSubscriptions)
            .set({
              expiresAt: newExpiry,
              tokenQuotaTotal: sql`${userSubscriptions.tokenQuotaTotal} + ${pkg.tokenQuota}`,
            })
            .where(eq(userSubscriptions.id, existingSub.id));
        } else {
          if (existingSub) {
            await db.update(userSubscriptions)
              .set({ status: 'expired' })
              .where(eq(userSubscriptions.id, existingSub.id));
          }
          await db.insert(userSubscriptions).values({
            userId: ctx.userId,
            packageId: order.packageId,
            status: 'active',
            startedAt: now,
            expiresAt,
            tokenQuotaTotal: pkg.tokenQuota,
            tokenQuotaUsed: 0,
          });
        }
      }

      return { ok: true, tokenAmount: order.tokenAmount };
    }),

  // 获取我的充值订单
  getRechargeOrders: protectedProcedure.query(async ({ ctx }) => {
    const orders = await db.select().from(tokenRechargeOrders)
      .where(eq(tokenRechargeOrders.userId, ctx.userId))
      .orderBy(desc(tokenRechargeOrders.createdAt))
      .limit(20);
    return orders;
  }),

  // ===== 管理员端 =====

  // 渠道管理（仅总管理员）
  listChannels: adminProcedureLevel(0).query(async () => {
    return db.select().from(apiChannels).orderBy(sql`${apiChannels.createdAt} DESC`);
  }),

  addChannel: adminProcedureLevel(0)
    .input(z.object({
      provider: z.string().min(1),
      name: z.string().optional(),
      apiKeyPlain: z.string().min(1),
      baseUrl: z.string().optional(),
      priority: z.number().default(0),
      weight: z.number().default(1),
      userTier: z.string().default('all'),
      dailyLimit: z.number().default(5000000),
    }))
    .mutation(async ({ input }) => {
      try {
        const [ch] = await db.insert(apiChannels).values({
          provider: input.provider,
          name: input.name || null,
          apiKeyEncrypted: encryptApiKey(input.apiKeyPlain),
          baseUrl: input.baseUrl || null,
          priority: input.priority,
          weight: input.weight,
          userTier: input.userTier,
          dailyLimit: input.dailyLimit,
        }).returning();
        return {
          id: ch!.id,
          provider: ch!.provider,
          name: ch!.name,
          status: ch!.status,
        };
      } catch (error) {
        console.error('[token.addChannel] failed', {
          provider: input.provider,
          name: input.name || null,
          baseUrl: input.baseUrl || null,
          priority: input.priority,
          weight: input.weight,
          userTier: input.userTier,
          dailyLimit: input.dailyLimit,
          error,
        });
        throw error;
      }
    }),

  updateChannel: adminProcedureLevel(0)
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().optional(),
      status: z.string().optional(),
      priority: z.number().optional(),
      weight: z.number().optional(),
      dailyLimit: z.number().optional(),
      userTier: z.string().optional(),
      baseUrl: z.string().optional(),
      apiKeyPlain: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, apiKeyPlain, ...updates } = input;
      const setData: any = { ...updates, updatedAt: new Date() };
      if (apiKeyPlain) {
        setData.apiKeyEncrypted = encryptApiKey(apiKeyPlain);
      }
      await db.update(apiChannels)
        .set(setData)
        .where(eq(apiChannels.id, id));
      return { ok: true };
    }),

  deleteChannel: adminProcedureLevel(0)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db.delete(apiChannels).where(eq(apiChannels.id, input.id));
      return { ok: true };
    }),

  // 渠道详情统计（按 channel 聚合真实归因数据）
  getChannelDetail: adminProcedureLevel(0)
    .input(z.object({ channelId: z.string().uuid() }))
    .query(async ({ input }) => {
      const [channel] = await db.select().from(apiChannels).where(eq(apiChannels.id, input.channelId));
      if (!channel) throw new TRPCError({ code: 'NOT_FOUND', message: '渠道不存在' });

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [todaySummary] = await db.select({
        totalCost: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.cost}), 0)::bigint`,
        totalRequests: sql<number>`COUNT(*)::int`,
        totalUsers: sql<number>`COUNT(DISTINCT ${tokenConsumptionLogs.userId})::int`,
        totalInputTokens: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.inputTokens}), 0)::bigint`,
        totalOutputTokens: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.outputTokens}), 0)::bigint`,
      })
        .from(tokenConsumptionLogs)
        .where(and(
          eq(tokenConsumptionLogs.channelId, channel.id),
          sql`${tokenConsumptionLogs.createdAt} >= ${todayStart}`,
        ));

      const [lifetimeSummary] = await db.select({
        lifetimeCost: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.cost}), 0)::bigint`,
        lifetimeRequests: sql<number>`COUNT(*)::int`,
        lifetimeUsers: sql<number>`COUNT(DISTINCT ${tokenConsumptionLogs.userId})::int`,
        lifetimeInputTokens: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.inputTokens}), 0)::bigint`,
        lifetimeOutputTokens: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.outputTokens}), 0)::bigint`,
      })
        .from(tokenConsumptionLogs)
        .where(eq(tokenConsumptionLogs.channelId, channel.id));

      const hourlyRows = await db.select({
        hour: sql<number>`EXTRACT(HOUR FROM ${tokenConsumptionLogs.createdAt})::int`,
        cost: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.cost}), 0)::bigint`,
        inputTokens: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.inputTokens}), 0)::bigint`,
        outputTokens: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.outputTokens}), 0)::bigint`,
        count: sql<number>`COUNT(*)::int`,
      })
        .from(tokenConsumptionLogs)
        .where(and(
          eq(tokenConsumptionLogs.channelId, channel.id),
          sql`${tokenConsumptionLogs.createdAt} >= ${todayStart}`,
        ))
        .groupBy(sql`EXTRACT(HOUR FROM ${tokenConsumptionLogs.createdAt})`)
        .orderBy(sql`EXTRACT(HOUR FROM ${tokenConsumptionLogs.createdAt})`);

      const userRanking = await db.select({
        userId: tokenConsumptionLogs.userId,
        cost: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.cost}), 0)::bigint`,
        count: sql<number>`COUNT(*)::int`,
        inputTokens: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.inputTokens}), 0)::bigint`,
        outputTokens: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.outputTokens}), 0)::bigint`,
      })
        .from(tokenConsumptionLogs)
        .where(and(
          eq(tokenConsumptionLogs.channelId, channel.id),
          sql`${tokenConsumptionLogs.createdAt} >= ${todayStart}`,
        ))
        .groupBy(tokenConsumptionLogs.userId)
        .orderBy(sql`COALESCE(SUM(${tokenConsumptionLogs.cost}), 0) DESC`)
        .limit(20);

      const monthlyData = await db.select({
        date: sql<string>`TO_CHAR(${tokenConsumptionLogs.createdAt}, 'YYYY-MM-DD')`,
        label: sql<string>`TO_CHAR(${tokenConsumptionLogs.createdAt}, 'MM-DD')`,
        cost: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.cost}), 0)::bigint`,
        inputTokens: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.inputTokens}), 0)::bigint`,
        outputTokens: sql<number>`COALESCE(SUM(${tokenConsumptionLogs.outputTokens}), 0)::bigint`,
        count: sql<number>`COUNT(*)::int`,
      })
        .from(tokenConsumptionLogs)
        .where(and(
          eq(tokenConsumptionLogs.channelId, channel.id),
          sql`${tokenConsumptionLogs.createdAt} >= ${monthStart}`,
        ))
        .groupBy(sql`DATE(${tokenConsumptionLogs.createdAt})`, sql`TO_CHAR(${tokenConsumptionLogs.createdAt}, 'YYYY-MM-DD')`, sql`TO_CHAR(${tokenConsumptionLogs.createdAt}, 'MM-DD')`)
        .orderBy(sql`DATE(${tokenConsumptionLogs.createdAt})`);

      const hourlyMap: Record<number, { cost: number; inputTokens: number; outputTokens: number; count: number }> = {};
      for (let h = 0; h < 24; h++) {
        hourlyMap[h] = { cost: 0, inputTokens: 0, outputTokens: 0, count: 0 };
      }
      for (const row of hourlyRows) {
        hourlyMap[row.hour] = {
          cost: row.cost ?? 0,
          inputTokens: row.inputTokens ?? 0,
          outputTokens: row.outputTokens ?? 0,
          count: row.count ?? 0,
        };
      }

      const currentHour = new Date().getHours();
      const hourlyData = Array.from({ length: currentHour + 1 }, (_, h) => ({
        hour: h,
        label: `${h}:00`,
        ...hourlyMap[h],
      }));

      const monthTotalCost = monthlyData.reduce((sum, item) => sum + (item.cost ?? 0), 0);
      const monthTotalRequests = monthlyData.reduce((sum, item) => sum + (item.count ?? 0), 0);

      return {
        channel,
        hourlyData,
        userRanking,
        totalCost: todaySummary?.totalCost ?? 0,
        totalRequests: todaySummary?.totalRequests ?? 0,
        totalUsers: todaySummary?.totalUsers ?? 0,
        totalInputTokens: todaySummary?.totalInputTokens ?? 0,
        totalOutputTokens: todaySummary?.totalOutputTokens ?? 0,
        lifetimeCost: lifetimeSummary?.lifetimeCost ?? 0,
        lifetimeRequests: lifetimeSummary?.lifetimeRequests ?? 0,
        lifetimeUsers: lifetimeSummary?.lifetimeUsers ?? 0,
        lifetimeInputTokens: lifetimeSummary?.lifetimeInputTokens ?? 0,
        lifetimeOutputTokens: lifetimeSummary?.lifetimeOutputTokens ?? 0,
        monthlyData,
        monthTotalCost,
        monthTotalRequests,
      };
    }),

  // 模型定价管理（仅总管理员）
  listPricing: adminProcedureLevel(0).query(async () => {
    return db.select().from(modelPricing).orderBy(sql`${modelPricing.sortOrder} ASC`);
  }),

  addPricing: adminProcedureLevel(0)
    .input(z.object({
      provider: z.string(),
      modelId: z.string(),
      modelName: z.string(),
      groupName: z.string().default('default'),
      inputPricePer1m: z.number(),
      outputPricePer1m: z.number(),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const [p] = await db.insert(modelPricing).values(input).returning();
      return p;
    }),

  updatePricing: adminProcedureLevel(0)
    .input(z.object({
      id: z.string().uuid(),
      provider: z.string().optional(),
      modelId: z.string().optional(),
      modelName: z.string().optional(),
      groupName: z.string().optional(),
      inputPricePer1m: z.number().optional(),
      outputPricePer1m: z.number().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      await db.update(modelPricing).set(updates).where(eq(modelPricing.id, id));
      return { ok: true };
    }),

  // 管理员为用户充值（仅总管理员）
  adminRecharge: adminProcedureLevel(0)
    .input(z.object({ userId: z.string().uuid(), amount: z.number().min(0) }))
    .mutation(async ({ input }) => {
      await tokenBilling.ensureAccount(input.userId);
      await db.update(userTokenAccounts)
        .set({
          balance: sql`${userTokenAccounts.balance} + ${input.amount}`,
          totalRecharged: sql`${userTokenAccounts.totalRecharged} + ${input.amount}`,
          updatedAt: new Date(),
        })
        .where(eq(userTokenAccounts.userId, input.userId));
      return { ok: true };
    }),

  // ===== 营业统计（仅总管理员） =====

  // 营收总览
  getRevenueStats: adminProcedureLevel(0).query(async () => {
    // 总充值收入
    const [rechargeRow] = await db.select({
      totalBalance: sql<number>`COALESCE(SUM(${userTokenAccounts.balance}), 0)`,
      totalRecharged: sql<number>`COALESCE(SUM(${userTokenAccounts.totalRecharged}), 0)`,
      totalConsumed: sql<number>`COALESCE(SUM(${userTokenAccounts.totalConsumed}), 0)`,
      totalAccounts: sql<number>`COUNT(*)`,
    }).from(userTokenAccounts);

    // API Key 数量
    const [keyRow] = await db.select({
      totalKeys: sql<number>`COUNT(*)`,
      activeKeys: sql<number>`COUNT(CASE WHEN ${userApiKeys.status} = 'active' THEN 1 END)`,
    }).from(userApiKeys);

    // 渠道总消耗
    const [channelRow] = await db.select({
      totalChannels: sql<number>`COUNT(*)`,
      activeChannels: sql<number>`COUNT(CASE WHEN ${apiChannels.status} = 'active' THEN 1 END)`,
      totalDailyUsed: sql<number>`COALESCE(SUM(${apiChannels.dailyUsed}), 0)`,
    }).from(apiChannels);

    return {
      totalBalance: Number(rechargeRow?.totalBalance || 0),
      totalRecharged: Number(rechargeRow?.totalRecharged || 0),
      totalConsumed: Number(rechargeRow?.totalConsumed || 0),
      totalAccounts: Number(rechargeRow?.totalAccounts || 0),
      totalOrders: 0,
      totalOrderAmount: 0,
      totalKeys: Number(keyRow?.totalKeys || 0),
      activeKeys: Number(keyRow?.activeKeys || 0),
      totalChannels: Number(channelRow?.totalChannels || 0),
      activeChannels: Number(channelRow?.activeChannels || 0),
      totalDailyUsed: Number(channelRow?.totalDailyUsed || 0),
    };
  }),

  // 用户消耗排名
  getTopConsumers: adminProcedureLevel(0)
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const result = await db.select({
        userId: userTokenAccounts.userId,
        balance: userTokenAccounts.balance,
        totalConsumed: userTokenAccounts.totalConsumed,
        totalRecharged: userTokenAccounts.totalRecharged,
        nickname: users.nickname,
        email: users.email,
      })
        .from(userTokenAccounts)
        .leftJoin(users, eq(userTokenAccounts.userId, users.id))
        .orderBy(desc(userTokenAccounts.totalConsumed))
        .limit(input.limit);
      return result.map(r => ({
        userId: r.userId,
        nickname: r.nickname,
        email: r.email,
        balance: Number(r.balance ?? 0),
        totalConsumed: Number(r.totalConsumed ?? 0),
        totalRecharged: Number(r.totalRecharged ?? 0),
      }));
    }),

  // 营收趋势（按天）
  getRevenueTrend: adminProcedureLevel(0)
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ input }) => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.days);
      const logs = await db.select({
        createdAt: tokenConsumptionLogs.createdAt,
        cost: tokenConsumptionLogs.cost,
      })
        .from(tokenConsumptionLogs)
        .where(sql`${tokenConsumptionLogs.createdAt} >= ${startDate.toISOString()}`);

      // 按天聚合
      const byDate: Record<string, { count: number; totalCost: number }> = {};
      for (const log of logs) {
        const date = log.createdAt?.toISOString().slice(0, 10) || '';
        if (!byDate[date]) byDate[date] = { count: 0, totalCost: 0 };
        byDate[date].count++;
        byDate[date].totalCost += (log.cost ?? 0);
      }

      return Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({ date, ...data }));
    }),

  // ===== 系统设置（仅总管理员） =====

  // 获取系统设置
  getSystemSetting: protectedProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(systemSettings)
        .where(eq(systemSettings.key, input.key));
      return { key: input.key, value: row?.value ?? null };
    }),

  // 更新系统设置
  setSystemSetting: adminProcedureLevel(0)
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input }) => {
      await db.insert(systemSettings)
        .values({ key: input.key, value: input.value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: input.value, updatedAt: new Date() },
        });
      return { ok: true };
    }),

  // ===== 用户组管理（仅总管理员） =====

  listUserGroups: adminProcedureLevel(0).query(async () => {
    return db.select().from(userGroups).orderBy(sql`${userGroups.sortOrder} ASC`);
  }),

  updateUserGroup: adminProcedureLevel(0)
    .input(z.object({
      name: z.string().min(1),
      dailyTokenLimit: z.number().int().min(0).optional(),
      allowedModelGroups: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const { name, ...updates } = input;
      const setData: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.dailyTokenLimit !== undefined) setData.dailyTokenLimit = updates.dailyTokenLimit;
      if (updates.allowedModelGroups !== undefined) setData.allowedModelGroups = updates.allowedModelGroups;
      await db.update(userGroups).set(setData).where(eq(userGroups.name, name));
      return { ok: true };
    }),
});
