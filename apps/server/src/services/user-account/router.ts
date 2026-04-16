// 用户账户 tRPC 路由（签到、邀请码、账单）
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../trpc';
import { db } from '../../db';
import {
  users, subscriptions, checkinRecords, referralRecords, transactions, userSprites,
} from '../../db/schema';
import { randomBytes } from 'crypto';
import { hashPassword, verifyPassword } from '../auth/utils';

// 生成6位邀请码
function generateInviteCode(): string {
  return randomBytes(3).toString('base64url').slice(0, 6).toUpperCase();
}

export const userAccountRouter = router({
  // 获取用户信息
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await db.select().from(users).where(eq(users.id, ctx.userId));
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });

    const [sub] = await db.select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.userId));

    // 计算 VIP 等级
    let vipLevel = '免费版';
    let vipExpiresAt = null;
    if (sub?.status === 'premium' && sub.currentPeriodEnd) {
      const daysLeft = Math.ceil((sub.currentPeriodEnd.getTime() - Date.now()) / 86400000);
      if (daysLeft > 0) {
        vipLevel = daysLeft > 365 ? '年费VIP' : daysLeft > 30 ? 'VIP' : '体验VIP';
        vipExpiresAt = sub.currentPeriodEnd;
      }
    } else if (sub?.status === 'trial' && sub.trialEndsAt) {
      const daysLeft = Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86400000);
      if (daysLeft > 0) {
        vipLevel = daysLeft > 365 ? '年费VIP' : daysLeft > 30 ? 'VIP' : '体验VIP';
        vipExpiresAt = sub.trialEndsAt;
      }
    }

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      displayId: user.displayId,
      inviteCode: user.inviteCode,
      trialDaysEarned: user.trialDaysEarned,
      checkinStreak: user.checkinStreak,
      vipLevel,
      vipExpiresAt,
    };
  }),

  // 更新用户资料
  updateProfile: protectedProcedure
    .input(z.object({
      nickname: z.string().optional(),
      avatarUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.update(users)
        .set({
          ...(input.nickname && { nickname: input.nickname }),
          ...(input.avatarUrl && { avatarUrl: input.avatarUrl }),
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.userId));
      return { ok: true };
    }),

  // 获取或生成邀请码
  getInviteCode: protectedProcedure.mutation(async ({ ctx }) => {
    const [user] = await db.select({ inviteCode: users.inviteCode })
      .from(users).where(eq(users.id, ctx.userId));

    if (user.inviteCode) return { code: user.inviteCode };

    const code = generateInviteCode();
    await db.update(users)
      .set({ inviteCode: code })
      .where(eq(users.id, ctx.userId));
    return { code };
  }),

  // 使用邀请码
  useInviteCode: protectedProcedure
    .input(z.object({ code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.userId) {
        const [referrer] = await db.select({ id: users.id })
          .from(users).where(eq(users.inviteCode, input.code.toUpperCase()));
        if (!referrer) throw new TRPCError({ code: 'NOT_FOUND', message: '邀请码无效' });

        const [currentUser] = await db.select({ referredByCode: users.referredByCode })
          .from(users).where(eq(users.id, ctx.userId));
        if (currentUser.referredByCode) throw new TRPCError({ code: 'BAD_REQUEST', message: '已使用过邀请码' });

        // 更新被邀请人
        await db.update(users)
          .set({ referredByCode: input.code.toUpperCase() })
          .where(eq(users.id, ctx.userId));

        // 双方各 +300 精灵豆奖励
        const INVITE_REWARD_BEANS = 300;

        // 给推荐人加精灵豆
        const [referrerSprite] = await db.select({ beanBalance: userSprites.beanBalance })
          .from(userSprites).where(eq(userSprites.userId, referrer.id));
        if (referrerSprite) {
          const newReferrerBalance = (referrerSprite.beanBalance ?? 0) + INVITE_REWARD_BEANS;
          await db.update(userSprites).set({ beanBalance: newReferrerBalance }).where(eq(userSprites.userId, referrer.id));
        }

        // 给被邀请人加精灵豆
        const [currentUserSprite] = await db.select({ beanBalance: userSprites.beanBalance })
          .from(userSprites).where(eq(userSprites.userId, ctx.userId));
        if (currentUserSprite) {
          const newUserBalance = (currentUserSprite.beanBalance ?? 0) + INVITE_REWARD_BEANS;
          await db.update(userSprites).set({ beanBalance: newUserBalance }).where(eq(userSprites.userId, ctx.userId));
        }

        // 记录邀请
        await db.insert(referralRecords).values({
          referrerId: referrer.id,
          referredId: ctx.userId,
          rewardDays: 0,
        });

        return { ok: true, rewardBeans: INVITE_REWARD_BEANS };
      }
      return { ok: false };
    }),

  // 签到
  checkin: protectedProcedure.mutation(async ({ ctx }) => {
    const [user] = await db.select({
      lastCheckinAt: users.lastCheckinAt,
      checkinStreak: users.checkinStreak,
      trialDaysEarned: users.trialDaysEarned,
    }).from(users).where(eq(users.id, ctx.userId));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 检查今天是否已签到
    if (user.lastCheckinAt) {
      const lastDate = new Date(user.lastCheckinAt);
      lastDate.setHours(0, 0, 0, 0);
      if (lastDate.getTime() === today.getTime()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '今天已签到' });
      }
    }

    // 计算新的连续签到天数
    let newStreak = 1;
    if (user.lastCheckinAt) {
      const lastDate = new Date(user.lastCheckinAt);
      const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / 86400000);
      if (diffDays === 1) {
        newStreak = (user.checkinStreak || 0) + 1;
      }
    }

    // 记录签到
    await db.insert(checkinRecords).values({
      userId: ctx.userId,
      checkinDate: today,
      daysToNextReward: newStreak % 10,
    });

    // 更新用户
    await db.update(users)
      .set({
        lastCheckinAt: today,
        checkinStreak: newStreak,
      })
      .where(eq(users.id, ctx.userId));

    // 每签到 10 天获得 1 天体验时长
    let rewarded = false;
    if (newStreak % 10 === 0) {
      await db.update(users)
        .set({ trialDaysEarned: sql`${users.trialDaysEarned} + 1` })
        .where(eq(users.id, ctx.userId));
      rewarded = true;
    }

    return {
      streak: newStreak,
      daysToNextReward: newStreak % 10,
      rewarded,
    };
  }),

  // 获取签到状态
  getCheckinStatus: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await db.select({
      lastCheckinAt: users.lastCheckinAt,
      checkinStreak: users.checkinStreak,
      trialDaysEarned: users.trialDaysEarned,
    }).from(users).where(eq(users.id, ctx.userId));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let checkedToday = false;
    if (user.lastCheckinAt) {
      const lastDate = new Date(user.lastCheckinAt);
      lastDate.setHours(0, 0, 0, 0);
      checkedToday = lastDate.getTime() === today.getTime();
    }

    return {
      checkedToday,
      streak: user.checkinStreak || 0,
      daysToNextReward: (user.checkinStreak || 0) % 10,
      trialDaysEarned: user.trialDaysEarned || 0,
    };
  }),

  // 获取账单记录
  getTransactions: protectedProcedure
    .input(z.object({
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      return db.select()
        .from(transactions)
        .where(eq(transactions.userId, ctx.userId))
        .orderBy(desc(transactions.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // 修改密码
  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6),
    }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await db.select({ passwordHash: users.passwordHash })
        .from(users).where(eq(users.id, ctx.userId));
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });

      const valid = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!valid) throw new TRPCError({ code: 'BAD_REQUEST', message: '当前密码不正确' });

      const newHash = await hashPassword(input.newPassword);
      await db.update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, ctx.userId));

      return { ok: true };
    }),

  // 获取订阅套餐对比
  getPlanComparison: protectedProcedure.query(async () => {
    return {
      plans: [
        {
          id: 'free',
          name: '免费版',
          price: 0,
          duration: null,
          features: [
            '基础 AI 对话',
            '3 个项目',
            '基础模板',
            '每月 10 万 token 免费额度',
          ],
          limitations: [
            '无法使用高级模板',
            '无法上传头像',
            '无优先客服',
          ],
        },
        {
          id: 'trial',
          name: '体验版',
          price: 0,
          duration: '按体验时长计算',
          features: [
            '免费版所有功能',
            '更多 AI 调用额度',
            '可上传自定义头像',
          ],
        },
        {
          id: 'premium_3d',
          name: '3 天体验',
          price: 299, // 2.99 元
          duration: '3 天',
          features: ['全部功能', '无限项目', '所有模板', '优先客服'],
        },
        {
          id: 'premium_5d',
          name: '5 天体验',
          price: 499, // 4.99 元
          duration: '5 天',
          features: ['全部功能', '无限项目', '所有模板', '优先客服'],
        },
        {
          id: 'premium_7d',
          name: '7 天体验',
          price: 699, // 6.99 元
          duration: '7 天',
          features: ['全部功能', '无限项目', '所有模板', '优先客服'],
        },
        {
          id: 'premium_30d',
          name: '月度 VIP',
          price: 2999, // 29.99 元
          duration: '30 天',
          features: ['全部功能', '无限项目', '所有模板', '优先客服', '专属模板'],
          recommended: true,
        },
      ],
    };
  }),
});
