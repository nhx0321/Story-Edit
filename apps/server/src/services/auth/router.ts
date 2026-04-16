import { router, publicProcedure, protectedProcedure } from '../../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { hashPassword, verifyPassword, generateToken, verifyToken } from './utils';
import { db } from '../../db';
import { users, subscriptions } from '../../db/schema';
import { eq, sql } from 'drizzle-orm';

export const authRouter = router({
  register: publicProcedure
    .input(z.object({
      email: z.string().email().optional(),
      phone: z.string().min(6).optional(),
      password: z.string().min(8),
      nickname: z.string().min(1).max(100).optional(),
    }).refine(data => data.email || data.phone, {
      message: '邮箱或手机号至少填一个',
    }))
    .mutation(async ({ input }) => {
      // 检查是否已注册
      if (input.email) {
        const existing = await db.query.users.findFirst({
          where: eq(users.email, input.email),
        });
        if (existing) throw new TRPCError({ code: 'CONFLICT', message: '该邮箱已注册' });
      }
      if (input.phone) {
        const existing = await db.query.users.findFirst({
          where: eq(users.phone, input.phone),
        });
        if (existing) throw new TRPCError({ code: 'CONFLICT', message: '该手机号已注册' });
      }

      const passwordHash = await hashPassword(input.password);

      // 生成 display_id
      const [{ maxSeq }] = await db.select({
        maxSeq: sql<number>`COALESCE(MAX(CAST(SUBSTRING(display_id FROM 4) AS INTEGER)), 99999)`,
      }).from(users);
      const nextSeq = (maxSeq || 99999) + 1;
      const displayId = `UID${String(nextSeq).padStart(6, '0')}`;

      const [user] = await db.insert(users).values({
        email: input.email,
        phone: input.phone,
        passwordHash,
        nickname: input.nickname || '创作者',
        displayId,
      }).returning();

      // 创建3天试用订阅
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 3);

      await db.insert(subscriptions).values({
        userId: user.id,
        status: 'trial',
        trialEndsAt,
      });

      const token = generateToken(user.id);
      return { token, user: { id: user.id, email: user.email, nickname: user.nickname, isAdmin: user.isAdmin, displayId: user.displayId, adminLevel: user.adminLevel } };
    }),

  login: publicProcedure
    .input(z.object({
      account: z.string().min(1),
      password: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const user = await db.query.users.findFirst({
        where: input.account.includes('@')
          ? eq(users.email, input.account)
          : eq(users.phone, input.account),
      });

      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: '账号不存在' });

      const valid = await verifyPassword(input.password, user.passwordHash);
      if (!valid) throw new TRPCError({ code: 'UNAUTHORIZED', message: '密码错误' });

      const token = generateToken(user.id);
      return { token, user: { id: user.id, email: user.email, nickname: user.nickname, isAdmin: user.isAdmin, displayId: user.displayId, adminLevel: user.adminLevel } };
    }),

  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' });

    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
      with: { subscription: true },
    });

    if (!user) throw new TRPCError({ code: 'NOT_FOUND' });

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      isAdmin: user.isAdmin,
      adminLevel: user.adminLevel,
      displayId: user.displayId,
      subscription: user.subscription,
    };
  }),

  updateProfile: protectedProcedure
    .input(z.object({
      nickname: z.string().min(1).max(100).optional(),
      email: z.string().email().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const data: Record<string, unknown> = { updatedAt: new Date() };
      if (input.nickname !== undefined) data.nickname = input.nickname;
      if (input.email !== undefined) data.email = input.email;
      const [updated] = await db.update(users).set(data).where(eq(users.id, ctx.userId)).returning();
      return { id: updated!.id, email: updated!.email, nickname: updated!.nickname };
    }),
});
