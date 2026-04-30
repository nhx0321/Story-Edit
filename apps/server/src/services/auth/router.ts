import { router, publicProcedure, protectedProcedure } from '../../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { hashPassword, verifyPassword, generateToken, verifyToken } from './utils';
import { db } from '../../db';
import { users, passwordResetTokens } from '../../db/schema';
import { ensureUserSprite } from '../sprite/bean-service';
import { eq, and, gt, isNull, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';

const PASSWORD_RESET_SENT_MESSAGE = '如果该账号存在，重置链接已发送';

function getAccountLookupCondition(account: string) {
  return account.includes('@')
    ? eq(users.email, account)
    : eq(users.phone, account);
}

async function bindUniqueUserField(
  userId: string,
  field: 'email' | 'phone',
  value: string,
  conflictMessage: string,
) {
  const column = field === 'email' ? users.email : users.phone;
  const existing = await db.query.users.findFirst({
    where: eq(column, value),
  });

  if (existing && existing.id !== userId) {
    throw new TRPCError({ code: 'CONFLICT', message: conflictMessage });
  }

  await db.update(users)
    .set({ [field]: value, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

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

      // 创建 Token 账户（自动获得 5,000,000 初始额度）
      const { ensureAccount } = await import('../token-relay/token-billing');
      await ensureAccount(user.id);
      await ensureUserSprite(user.id);

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
        where: getAccountLookupCondition(input.account),
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

  // 绑定邮箱
  bindEmail: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      await bindUniqueUserField(ctx.userId, 'email', input.email, '该邮箱已被其他账号绑定');
      return { ok: true };
    }),

  // 绑定手机号
  bindPhone: protectedProcedure
    .input(z.object({ phone: z.string().min(6).max(20) }))
    .mutation(async ({ ctx, input }) => {
      await bindUniqueUserField(ctx.userId, 'phone', input.phone, '该手机号已被其他账号绑定');
      return { ok: true };
    }),

  // 请求密码重置（通过邮箱或手机号）
  requestPasswordReset: publicProcedure
    .input(z.object({ account: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const user = await db.query.users.findFirst({
        where: getAccountLookupCondition(input.account),
      });
      // 无论用户是否存在都返回成功，防止账号枚举
      if (!user) return { ok: true, message: PASSWORD_RESET_SENT_MESSAGE };

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30分钟有效

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      // TODO: 生产环境接入邮件/短信服务发送重置链接
      return { ok: true, message: PASSWORD_RESET_SENT_MESSAGE };
    }),

  // 验证重置令牌
  verifyResetToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const record = await db.query.passwordResetTokens.findFirst({
        where: and(
          eq(passwordResetTokens.token, input.token),
          gt(passwordResetTokens.expiresAt, new Date()),
          isNull(passwordResetTokens.usedAt),
        ),
      });
      return { valid: !!record };
    }),

  // 重置密码
  resetPassword: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      newPassword: z.string().min(6),
    }))
    .mutation(async ({ input }) => {
      const record = await db.query.passwordResetTokens.findFirst({
        where: and(
          eq(passwordResetTokens.token, input.token),
          gt(passwordResetTokens.expiresAt, new Date()),
          isNull(passwordResetTokens.usedAt),
        ),
      });
      if (!record) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '重置链接无效或已过期' });
      }

      const newHash = await hashPassword(input.newPassword);
      await db.update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, record.userId));

      // 标记令牌已使用
      await db.update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, record.id));

      return { ok: true };
    }),
});
