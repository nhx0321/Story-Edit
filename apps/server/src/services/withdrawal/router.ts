// 提现申请 + 创作者收益路由
import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../../trpc';
import { db } from '../../db';
import { eq, desc, and, sql } from 'drizzle-orm';
import {
  withdrawalRequests, transactions, templates, templatePurchases,
  templateLikes, users,
} from '../../db/schema';

export const withdrawalRouter = router({
  // ===== 用户端 =====

  // 获取可提现余额
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    // 模板销售收益
    const userTemplatesList = await db.select({ id: templates.id, title: templates.title, price: templates.price })
      .from(templates)
      .where(eq(templates.uploaderId, ctx.userId));

    let salesEarnings = 0;
    if (userTemplatesList.length > 0) {
      const templateIds = userTemplatesList.map(t => t.id);
      const purchases = await db.select({ pricePaid: templatePurchases.pricePaid })
        .from(templatePurchases)
        .where(sql`${templatePurchases.templateId} = ANY(${templateIds})`);
      salesEarnings = purchases.reduce((sum, p) => sum + (p.pricePaid ?? 0), 0);
    }

    // 点赞收益（1精灵豆 = 1分）
    const [likeRow] = await db.select({
      total: sql<number>`COALESCE(COUNT(*), 0)`,
    }).from(templateLikes)
      .innerJoin(templates, eq(templateLikes.templateId, templates.id))
      .where(eq(templates.uploaderId, ctx.userId));
    const likesEarnings = (likeRow?.total ?? 0) * 1; // 1分/like

    const totalEarnings = salesEarnings + likesEarnings;

    // 已提现金额
    const [withdrawnRow] = await db.select({
      total: sql<number>`COALESCE(SUM(${withdrawalRequests.amount}), 0)`,
    }).from(withdrawalRequests)
      .where(and(
        eq(withdrawalRequests.userId, ctx.userId),
        eq(withdrawalRequests.status, 'approved'),
      ));

    const withdrawn = withdrawnRow?.total ?? 0;
    const available = totalEarnings - withdrawn;

    return {
      available,
      totalEarnings,
      withdrawn,
      breakdown: {
        sales: salesEarnings,
        likes: likesEarnings,
      },
    };
  }),

  // 申请提现
  requestWithdrawal: protectedProcedure
    .input(z.object({
      amount: z.number().int().min(1000), // 最低10元 = 1000分
      accountInfo: z.string().min(1, '请输入收款信息'),
    }))
    .mutation(async ({ ctx, input }) => {
      // 计算可用余额
      const userTemplatesList = await db.select({ id: templates.id })
        .from(templates)
        .where(eq(templates.uploaderId, ctx.userId));

      let salesEarnings = 0;
      if (userTemplatesList.length > 0) {
        const templateIds = userTemplatesList.map(t => t.id);
        const purchases = await db.select({ pricePaid: templatePurchases.pricePaid })
          .from(templatePurchases)
          .where(sql`${templatePurchases.templateId} = ANY(${templateIds})`);
        salesEarnings = purchases.reduce((sum, p) => sum + (p.pricePaid ?? 0), 0);
      }

      const [likeRow] = await db.select({
        total: sql<number>`COALESCE(COUNT(*), 0)`,
      }).from(templateLikes)
        .innerJoin(templates, eq(templateLikes.templateId, templates.id))
        .where(eq(templates.uploaderId, ctx.userId));

      const totalEarnings = salesEarnings + (likeRow?.total ?? 0) * 1;

      const [withdrawnRow] = await db.select({
        total: sql<number>`COALESCE(SUM(${withdrawalRequests.amount}), 0)`,
      }).from(withdrawalRequests)
        .where(and(
          eq(withdrawalRequests.userId, ctx.userId),
          eq(withdrawalRequests.status, 'approved'),
        ));

      const available = totalEarnings - (withdrawnRow?.total ?? 0);

      if (input.amount > available) {
        throw new Error(`可提现余额不足，当前可提现 ¥${(available / 100).toFixed(2)}`);
      }

      // 检查是否有待处理的提现申请
      const [pending] = await db.select({ id: withdrawalRequests.id })
        .from(withdrawalRequests)
        .where(and(
          eq(withdrawalRequests.userId, ctx.userId),
          eq(withdrawalRequests.status, 'pending'),
        ))
        .limit(1);

      if (pending) {
        throw new Error('您有一笔提现申请正在审核中，请等待处理完成后再申请');
      }

      const [req] = await db.insert(withdrawalRequests).values({
        userId: ctx.userId,
        amount: input.amount,
        status: 'pending',
        note: input.accountInfo,
      }).returning();

      return req;
    }),

  // 提现历史
  getMyWithdrawals: protectedProcedure.query(async ({ ctx }) => {
    return db.select()
      .from(withdrawalRequests)
      .where(eq(withdrawalRequests.userId, ctx.userId))
      .orderBy(desc(withdrawalRequests.createdAt))
      .limit(50);
  }),

  // ===== 管理员端 =====

  // 提现统计
  getWithdrawalStats: adminProcedure.query(async () => {
    const [pendingRow] = await db.select({
      count: sql<number>`COUNT(*)`,
      total: sql<number>`COALESCE(SUM(${withdrawalRequests.amount}), 0)`,
    }).from(withdrawalRequests)
      .where(eq(withdrawalRequests.status, 'pending'));

    const [approvedRow] = await db.select({
      count: sql<number>`COUNT(*)`,
      total: sql<number>`COALESCE(SUM(${withdrawalRequests.amount}), 0)`,
    }).from(withdrawalRequests)
      .where(eq(withdrawalRequests.status, 'approved'));

    const [rejectedRow] = await db.select({
      count: sql<number>`COUNT(*)`,
      total: sql<number>`COALESCE(SUM(${withdrawalRequests.amount}), 0)`,
    }).from(withdrawalRequests)
      .where(eq(withdrawalRequests.status, 'rejected'));

    return {
      pending: { count: pendingRow?.count ?? 0, total: pendingRow?.total ?? 0 },
      approved: { count: approvedRow?.count ?? 0, total: approvedRow?.total ?? 0 },
      rejected: { count: rejectedRow?.count ?? 0, total: rejectedRow?.total ?? 0 },
    };
  }),

  // 提现列表
  listWithdrawals: adminProcedure
    .input(z.object({
      status: z.string().optional(), // pending / approved / rejected
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const conditions = [];
      if (input.status) {
        conditions.push(eq(withdrawalRequests.status, input.status));
      }

      const result = await db.select({
        id: withdrawalRequests.id,
        userId: withdrawalRequests.userId,
        amount: withdrawalRequests.amount,
        status: withdrawalRequests.status,
        note: withdrawalRequests.note,
        createdAt: withdrawalRequests.createdAt,
        nickname: users.nickname,
        email: users.email,
        displayId: users.displayId,
      })
        .from(withdrawalRequests)
        .leftJoin(users, eq(withdrawalRequests.userId, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(
          sql`CASE WHEN ${withdrawalRequests.status} = 'pending' THEN 0 ELSE 1 END`,
          desc(withdrawalRequests.createdAt),
        )
        .limit(input.limit)
        .offset(input.offset);

      return result.map(r => ({
        ...r,
        amount: Number(r.amount ?? 0),
      }));
    }),

  // 审核通过
  approveWithdrawal: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [req] = await db.select()
        .from(withdrawalRequests)
        .where(eq(withdrawalRequests.id, input.id))
        .limit(1);

      if (!req) throw new Error('提现申请不存在');
      if (req.status !== 'pending') throw new Error('该申请已处理');

      await db.update(withdrawalRequests)
        .set({
          status: 'approved',
          note: input.note ? `${req.note ?? ''} | 审核备注: ${input.note}` : req.note,
        })
        .where(eq(withdrawalRequests.id, input.id));

      // 记录交易
      await db.insert(transactions).values({
        userId: req.userId,
        type: 'withdraw',
        amount: -(req.amount ?? 0),
        description: `提现审核通过，金额 ¥${(req.amount ?? 0) / 100}`,
        status: 'completed',
        metadata: { withdrawalId: input.id, reviewedBy: ctx.userId },
      });

      return { ok: true };
    }),

  // 审核拒绝
  rejectWithdrawal: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      note: z.string().min(1, '请输入拒绝理由'),
    }))
    .mutation(async ({ input }) => {
      const [req] = await db.select()
        .from(withdrawalRequests)
        .where(eq(withdrawalRequests.id, input.id))
        .limit(1);

      if (!req) throw new Error('提现申请不存在');
      if (req.status !== 'pending') throw new Error('该申请已处理');

      await db.update(withdrawalRequests)
        .set({
          status: 'rejected',
          note: `${req.note ?? ''} | 拒绝理由: ${input.note}`,
        })
        .where(eq(withdrawalRequests.id, input.id));

      return { ok: true };
    }),
});
