// 用户反馈 + 站内信 tRPC 路由
import { z } from 'zod';
import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import { router, protectedProcedure, adminProcedure } from '../../trpc';
import { db } from '../../db';
import { feedbacks, notifications, users } from '../../db/schema';

export const feedbackRouter = router({
  // 用户提交反馈
  submit: protectedProcedure
    .input(z.object({
      type: z.enum(['feedback', 'bug', 'suggestion']).default('feedback'),
      title: z.string().min(1).max(200),
      content: z.string().min(1).max(5000),
      screenshot: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [fb] = await db.insert(feedbacks).values({
        userId: ctx.userId,
        type: input.type,
        title: input.title,
        content: input.content,
        screenshot: input.screenshot || null,
      }).returning();
      return { id: fb!.id };
    }),

  // 用户查看自己的反馈列表
  myList: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await db.select()
        .from(feedbacks)
        .where(eq(feedbacks.userId, ctx.userId))
        .orderBy(desc(feedbacks.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return rows;
    }),

  // 用户查看站内信
  notifications: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await db.select()
        .from(notifications)
        .where(eq(notifications.userId, ctx.userId))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return rows;
    }),

  // 未读站内信数量
  unreadCount: protectedProcedure
    .query(async ({ ctx }) => {
      const [result] = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(notifications)
        .where(and(
          eq(notifications.userId, ctx.userId),
          eq(notifications.isRead, false),
        ));
      return result?.count || 0;
    }),

  // 标记站内信已读
  markRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(notifications)
        .set({ isRead: true })
        .where(and(
          eq(notifications.id, input.id),
          eq(notifications.userId, ctx.userId),
        ));
      return { ok: true };
    }),

  // 全部标记已读
  markAllRead: protectedProcedure
    .mutation(async ({ ctx }) => {
      await db.update(notifications)
        .set({ isRead: true })
        .where(and(
          eq(notifications.userId, ctx.userId),
          eq(notifications.isRead, false),
        ));
      return { ok: true };
    }),

  // ===== 管理员接口 =====

  // 管理员查看所有反馈
  adminList: adminProcedure
    .input(z.object({
      status: z.enum(['pending', 'processing', 'resolved', 'closed']).optional(),
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const conditions = input.status
        ? [eq(feedbacks.status, input.status)]
        : [];
      const rows = await db.select({
        id: feedbacks.id,
        userId: feedbacks.userId,
        type: feedbacks.type,
        title: feedbacks.title,
        content: feedbacks.content,
        screenshot: feedbacks.screenshot,
        status: feedbacks.status,
        adminReply: feedbacks.adminReply,
        repliedAt: feedbacks.repliedAt,
        createdAt: feedbacks.createdAt,
        userName: users.nickname,
      })
        .from(feedbacks)
        .leftJoin(users, eq(feedbacks.userId, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(feedbacks.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return rows;
    }),

  // 管理员回复反馈 + 发送站内信
  adminReply: adminProcedure
    .input(z.object({
      feedbackId: z.string().uuid(),
      reply: z.string().min(1).max(5000),
      status: z.enum(['processing', 'resolved', 'closed']).default('resolved'),
    }))
    .mutation(async ({ input }) => {
      // 更新反馈状态
      const [fb] = await db.update(feedbacks)
        .set({
          adminReply: input.reply,
          status: input.status,
          repliedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(feedbacks.id, input.feedbackId))
        .returning();

      if (!fb) return { ok: false };

      // 发送站内信给用户
      await db.insert(notifications).values({
        userId: fb.userId,
        title: `您的反馈「${fb.title}」已回复`,
        content: input.reply,
        feedbackId: fb.id,
      });

      return { ok: true };
    }),

  // 管理员发送站内信
  adminSendNotification: adminProcedure
    .input(z.object({
      userId: z.string().uuid(),
      title: z.string().min(1).max(200),
      content: z.string().min(1).max(5000),
    }))
    .mutation(async ({ input }) => {
      await db.insert(notifications).values({
        userId: input.userId,
        title: input.title,
        content: input.content,
      });
      return { ok: true };
    }),
});
