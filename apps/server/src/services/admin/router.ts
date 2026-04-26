// 管理后台 tRPC 路由
import { z } from 'zod';
import { eq, and, desc, ilike, or, sql, count, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure, adminProcedureLevel, protectedProcedure } from '../../trpc';
import { db } from '../../db';
import {
  users, subscriptions, adminAuditLogs, systemPresets, artAssets, userSprites, userTokenAccounts,
} from '../../db/schema';
import * as artAssetService from './art-assets';
import { fileRouter } from '../sprite/file-router';
import { recordBeanTransaction } from '../sprite/bean-service';

// ========== 辅助函数：记录操作日志 ==========
async function logAudit(input: {
  adminId: string;
  adminLevel: number | null;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}) {
  await db.insert(adminAuditLogs).values({
    adminId: input.adminId,
    adminLevel: input.adminLevel,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ? input.targetId : null,
    details: input.details,
  });
}

// ========== 用户管理 ==========

export const adminRouter = router({
  // 用户列表（搜索/分页）
  listUsers: adminProcedure
    .input(z.object({
      search: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.limit;

      let whereClause = sql`true`;
      if (input.search) {
        const searchClause = or(
          ilike(users.nickname, `%${input.search}%`),
          ilike(users.displayId, `%${input.search}%`),
          ilike(users.email, `%${input.search}%`),
        );
        if (searchClause) whereClause = searchClause;
      }

      const [totalResult] = await db.select({ count: count() })
        .from(users).where(whereClause);

      const userList = await db.select({
        id: users.id,
        nickname: users.nickname,
        email: users.email,
        phone: users.phone,
        displayId: users.displayId,
        avatarUrl: users.avatarUrl,
        isAdmin: users.isAdmin,
        adminLevel: users.adminLevel,
        bannedFromPublish: users.bannedFromPublish,
        bannedFromPayment: users.bannedFromPayment,
        createdAt: users.createdAt,
      }).from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(input.limit)
        .offset(offset);

      // 获取每个用户的精灵数据（bonusDays, convertedDays）和订阅状态
      const userIds = userList.map(u => u.id);
      let sprites: { userId: string; bonusDays: number | null; convertedDays: number | null }[] = [];
      let subs: { userId: string; status: string; currentPeriodEnd: Date | null; trialEndsAt: Date | null }[] = [];
      if (userIds.length > 0) {
        sprites = await db.select({
          userId: userSprites.userId,
          bonusDays: userSprites.bonusDays,
          convertedDays: userSprites.convertedDays,
        }).from(userSprites)
          .where(inArray(userSprites.userId, userIds));
        subs = await db.select({
          userId: subscriptions.userId,
          status: subscriptions.status,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          trialEndsAt: subscriptions.trialEndsAt,
        }).from(subscriptions)
          .where(inArray(subscriptions.userId, userIds));
      }
      const spriteMap = new Map(sprites.map(s => [s.userId, s]));
      const subMap = new Map(subs.map(s => [s.userId, s]));

      return {
        users: userList.map(u => {
          const sprite = spriteMap.get(u.id);
          const sub = subMap.get(u.id);
          // VIP 天数从精灵系统计算（bonusDays + convertedDays）
          const totalVipDays = ((sprite?.bonusDays ?? 0) + (sprite?.convertedDays ?? 0));
          let vipLevel = '免费版';
          if (totalVipDays > 365) {
            vipLevel = '年费VIP';
          } else if (totalVipDays > 30) {
            vipLevel = 'VIP';
          } else if (totalVipDays > 0) {
            vipLevel = '体验VIP';
          } else if (sub?.status === 'premium' && sub.currentPeriodEnd && sub.currentPeriodEnd > new Date()) {
            const days = Math.ceil((sub.currentPeriodEnd.getTime() - Date.now()) / 86400000);
            vipLevel = days > 365 ? '年费VIP' : days > 30 ? 'VIP' : '体验VIP';
          } else if (sub?.status === 'trial' && sub.trialEndsAt && sub.trialEndsAt > new Date()) {
            vipLevel = '体验VIP';
          }
          return { ...u, vipLevel };
        }),
        total: totalResult?.count || 0,
        page: input.page,
        limit: input.limit,
      };
    }),

  // 设置订阅计划（免费版/付费版）
  setSubscriptionPlan: adminProcedure
    .input(z.object({
      userId: z.string().uuid(),
      plan: z.enum(['free', 'premium']),
      days: z.number().default(365),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminLevel = (ctx as any).adminLevel;
      if (adminLevel === null || adminLevel > 1) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '需要一级及以上管理权限' });
      }

      if (input.plan === 'free') {
        // 设为免费版：清除订阅记录
        await db.delete(subscriptions).where(eq(subscriptions.userId, input.userId));
        // 同时清空 userSprites bonusDays
        await db.update(userSprites)
          .set({ bonusDays: 0 })
          .where(eq(userSprites.userId, input.userId));
      } else {
        // 设为付费版：创建/更新 premium 订阅
        const newEnd = new Date();
        newEnd.setDate(newEnd.getDate() + input.days);
        const [sub] = await db.select({ id: subscriptions.id })
          .from(subscriptions).where(eq(subscriptions.userId, input.userId));
        if (sub) {
          await db.update(subscriptions).set({
            status: 'premium',
            currentPeriodStart: new Date(),
            currentPeriodEnd: newEnd,
          }).where(eq(subscriptions.id, sub.id));
        } else {
          await db.insert(subscriptions).values({
            userId: input.userId,
            status: 'premium',
            currentPeriodStart: new Date(),
            currentPeriodEnd: newEnd,
          });
        }
        // 同步 bonusDays
        await db.update(userSprites)
          .set({ bonusDays: input.days })
          .where(eq(userSprites.userId, input.userId));
      }

      await logAudit({
        adminId: ctx.userId,
        adminLevel,
        action: 'set_subscription_plan',
        targetType: 'user',
        targetId: input.userId,
        details: { plan: input.plan, days: input.days },
      });

      return { ok: true, plan: input.plan };
    }),

  // 增减付费时长
  adjustSubscription: adminProcedure
    .input(z.object({
      userId: z.string().uuid(),
      days: z.number(), // 正数=增加，负数=减少
    }))
    .mutation(async ({ ctx, input }) => {
      const adminLevel = (ctx as any).adminLevel;
      if (adminLevel === null || adminLevel > 1) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '需要一级及以上管理权限' });
      }

      const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId));
      if (!targetUser) throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });

      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, input.userId));

      if (!sub) {
        // 创建新订阅
        const newEnd = new Date();
        newEnd.setDate(newEnd.getDate() + Math.abs(input.days));
        await db.insert(subscriptions).values({
          userId: input.userId,
          status: input.days > 0 ? 'premium' : 'expired',
          currentPeriodStart: new Date(),
          currentPeriodEnd: input.days > 0 ? newEnd : null,
        });
      } else {
        const currentEnd = sub.currentPeriodEnd || new Date();
        const newEnd = new Date(currentEnd.getTime() + input.days * 86400000);
        await db.update(subscriptions).set({
          currentPeriodEnd: newEnd,
          status: newEnd > new Date() ? 'premium' : 'expired',
        }).where(eq(subscriptions.id, sub.id));
      }

      // 同步到 userSprites.bonusDays（VIP 时长）
      const [sprite] = await db.select({ bonusDays: userSprites.bonusDays })
        .from(userSprites).where(eq(userSprites.userId, input.userId));

      if (!sprite) {
        // 用户尚未孵化精灵，创建记录
        await db.insert(userSprites).values({
          userId: input.userId,
          bonusDays: input.days,
        });
      } else {
        // 已有精灵记录，增减 bonusDays
        const newBonusDays = Math.max(0, (sprite.bonusDays ?? 0) + input.days);
        await db.update(userSprites)
          .set({ bonusDays: newBonusDays })
          .where(eq(userSprites.userId, input.userId));
      }

      await logAudit({
        adminId: ctx.userId,
        adminLevel,
        action: 'adjust_subscription',
        targetType: 'user',
        targetId: input.userId,
        details: { days: input.days },
      });

      return { ok: true };
    }),

  // 禁止用户操作
  banUser: adminProcedure
    .input(z.object({
      userId: z.string().uuid(),
      banType: z.enum(['publish', 'payment', 'all']),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminLevel = (ctx as any).adminLevel;
      if (adminLevel === null || adminLevel > 1) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '需要一级及以上管理权限' });
      }

      const updates: Record<string, boolean> = {};
      if (input.banType === 'publish' || input.banType === 'all') updates.bannedFromPublish = true;
      if (input.banType === 'payment' || input.banType === 'all') updates.bannedFromPayment = true;

      await db.update(users).set(updates).where(eq(users.id, input.userId));

      await logAudit({
        adminId: ctx.userId,
        adminLevel,
        action: 'ban_user',
        targetType: 'user',
        targetId: input.userId,
        details: { banType: input.banType },
      });

      return { ok: true };
    }),

  // 解除禁止
  unbanUser: adminProcedure
    .input(z.object({
      userId: z.string().uuid(),
      banType: z.enum(['publish', 'payment', 'all']),
    }))
    .mutation(async ({ ctx, input }) => {
      const adminLevel = (ctx as any).adminLevel;
      if (adminLevel === null || adminLevel > 1) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '需要一级及以上管理权限' });
      }

      const updates: Record<string, boolean> = {};
      if (input.banType === 'publish' || input.banType === 'all') updates.bannedFromPublish = false;
      if (input.banType === 'payment' || input.banType === 'all') updates.bannedFromPayment = false;

      await db.update(users).set(updates).where(eq(users.id, input.userId));

      await logAudit({
        adminId: ctx.userId,
        adminLevel,
        action: 'unban_user',
        targetType: 'user',
        targetId: input.userId,
        details: { banType: input.banType },
      });

      return { ok: true };
    }),

  // 删除用户
  deleteUser: adminProcedureLevel(1)
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const adminLevel = (ctx as any).adminLevel;

      const [targetUser] = await db.select({ id: users.id, isAdmin: users.isAdmin })
        .from(users).where(eq(users.id, input.userId));
      if (!targetUser) throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });
      if (targetUser.isAdmin) throw new TRPCError({ code: 'BAD_REQUEST', message: '不能删除管理员账号' });

      // 软删除：清空用户数据
      await db.update(users).set({
        nickname: '已删除用户',
        email: null,
        phone: null,
        avatarUrl: null,
      }).where(eq(users.id, input.userId));

      await logAudit({
        adminId: ctx.userId,
        adminLevel,
        action: 'delete_user',
        targetType: 'user',
        targetId: input.userId,
      });

      return { ok: true };
    }),

  // 增减用户精灵豆
  adjustBeans: adminProcedureLevel(1)
    .input(z.object({
      userId: z.string().uuid(),
      amount: z.number().int(), // 正数=增加，负数=减少
    }))
    .mutation(async ({ ctx, input }) => {
      const adminLevel = (ctx as any).adminLevel;
      if (adminLevel === null || adminLevel > 1) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '需要一级及以上管理权限' });
      }

      const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId));
      if (!targetUser) throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });

      // 确保用户有精灵豆账户
      let [sprite] = await db.select({ beanBalance: userSprites.beanBalance })
        .from(userSprites).where(eq(userSprites.userId, input.userId));
      if (!sprite) {
        // 创建精灵豆账户
        await db.insert(userSprites).values({
          userId: input.userId,
          beanBalance: 0,
          totalBeanSpent: 0,
          totalXp: 0,
          level: 1,
          customName: null,
          isHatched: false,
          guideStep: 0,
        });
        // 重新获取以确保数据正确
        [sprite] = await db.select({ beanBalance: userSprites.beanBalance })
          .from(userSprites).where(eq(userSprites.userId, input.userId));
      }

      // 检查余额是否足够（减少时）
      if (input.amount < 0 && (sprite?.beanBalance ?? 0) < Math.abs(input.amount)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '用户精灵豆余额不足' });
      }

      await recordBeanTransaction({
        userId: input.userId,
        type: 'admin_adjust',
        amount: input.amount,
        description: input.amount > 0 ? '管理员增加' : '管理员减少',
        relatedType: 'admin',
        relatedId: ctx.userId,
      });

      await logAudit({
        adminId: ctx.userId,
        adminLevel,
        action: 'adjust_beans',
        targetType: 'user',
        targetId: input.userId,
        details: { amount: input.amount },
      });

      return { ok: true };
    }),

  // ========== 权限管理 ==========

  listAdmins: adminProcedureLevel(1)
    .query(async ({ ctx }) => {
      const adminLevel = (ctx as any).adminLevel;
      // level 0 查看所有管理员，其他级别仅查看比自己级别低的
      const baseWhere = eq(users.isAdmin, true);

      const selectFields = {
        id: users.id,
        nickname: users.nickname,
        displayId: users.displayId,
        adminLevel: users.adminLevel,
        createdAt: users.createdAt,
        lastActiveAt: users.lastActiveAt,
      };

      let result: typeof selectFields extends { id: any } ? Array<{ id: string; nickname: string | null; displayId: string | null; adminLevel: number | null; createdAt: Date; lastActiveAt: Date | null }> : never;

      if (adminLevel !== null && adminLevel > 0) {
        result = await db.select(selectFields).from(users)
          .where(and(baseWhere, sql`${users.adminLevel} > ${adminLevel}`))
          .orderBy(users.adminLevel);
      } else {
        result = await db.select(selectFields).from(users)
          .where(baseWhere)
          .orderBy(users.adminLevel);
      }

      const now = new Date();
      return result.map(a => ({
        ...a,
        isOnline: a.lastActiveAt ? (now.getTime() - a.lastActiveAt.getTime()) < 120000 : false,
      }));
    }),

  promoteToAdmin: adminProcedureLevel(0)
    .input(z.object({
      userId: z.string().uuid(),
      level: z.number().int().min(1).max(3),
    }))
    .mutation(async ({ ctx, input }) => {
      const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId));
      if (!targetUser) throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });

      await db.update(users).set({
        isAdmin: true,
        adminLevel: input.level,
      }).where(eq(users.id, input.userId));

      await logAudit({
        adminId: ctx.userId,
        adminLevel: 0,
        action: 'promote_admin',
        targetType: 'user',
        targetId: input.userId,
        details: { level: input.level },
      });

      return { ok: true };
    }),

  demoteAdmin: adminProcedureLevel(0)
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '不能取消自己的管理员权限' });
      }

      await db.update(users).set({
        isAdmin: false,
        adminLevel: null,
      }).where(eq(users.id, input.userId));

      await logAudit({
        adminId: ctx.userId,
        adminLevel: 0,
        action: 'demote_admin',
        targetType: 'user',
        targetId: input.userId,
      });

      return { ok: true };
    }),

  // ========== 预设管理 ==========

  listPresets: adminProcedure
    .input(z.object({
      category: z.string().optional(),
      projectType: z.string().optional(),
    }))
    .query(async ({ input }) => {
      let query = db.select().from(systemPresets);
      const conditions = [];
      if (input.category) conditions.push(eq(systemPresets.category, input.category));
      if (input.projectType) conditions.push(eq(systemPresets.projectType, input.projectType));

      if (conditions.length > 0) {
        return db.select().from(systemPresets).where(and(...conditions)).orderBy(systemPresets.sortOrder, systemPresets.createdAt);
      }
      return db.select().from(systemPresets).orderBy(systemPresets.sortOrder, systemPresets.createdAt);
    }),

  createPreset: adminProcedure
    .input(z.object({
      category: z.string().min(1),
      projectType: z.string().optional(),
      title: z.string().min(1),
      content: z.string().min(1),
      description: z.string().optional(),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const [preset] = await db.insert(systemPresets).values({
        category: input.category,
        projectType: input.projectType || null,
        title: input.title,
        content: input.content,
        description: input.description || null,
        sortOrder: input.sortOrder,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      }).returning();

      await logAudit({
        adminId: ctx.userId,
        adminLevel: (ctx as any).adminLevel,
        action: 'create_preset',
        targetType: 'preset',
        targetId: preset.id,
        details: { category: input.category, title: input.title },
      });

      return preset;
    }),

  updatePreset: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      category: z.string().optional(),
      projectType: z.string().nullable().optional(),
      title: z.string().optional(),
      content: z.string().optional(),
      description: z.string().nullable().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [existing] = await db.select().from(systemPresets).where(eq(systemPresets.id, id));
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: '预设不存在' });

      const updateData: Record<string, unknown> = { ...updates, updatedBy: ctx.userId, updatedAt: new Date() };
      const [preset] = await db.update(systemPresets).set(updateData).where(eq(systemPresets.id, id)).returning();

      await logAudit({
        adminId: ctx.userId,
        adminLevel: (ctx as any).adminLevel,
        action: 'update_preset',
        targetType: 'preset',
        targetId: id,
      });

      return preset;
    }),

  publishPreset: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      publish: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db.select().from(systemPresets).where(eq(systemPresets.id, input.id));
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: '预设不存在' });

      const [preset] = await db.update(systemPresets)
        .set({ isPublished: input.publish, updatedBy: ctx.userId, updatedAt: new Date() })
        .where(eq(systemPresets.id, input.id)).returning();

      await logAudit({
        adminId: ctx.userId,
        adminLevel: (ctx as any).adminLevel,
        action: input.publish ? 'publish_preset' : 'unpublish_preset',
        targetType: 'preset',
        targetId: input.id,
      });

      return preset;
    }),

  deletePreset: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db.select().from(systemPresets).where(eq(systemPresets.id, input.id));
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: '预设不存在' });

      await db.delete(systemPresets).where(eq(systemPresets.id, input.id));

      await logAudit({
        adminId: ctx.userId,
        adminLevel: (ctx as any).adminLevel,
        action: 'delete_preset',
        targetType: 'preset',
        targetId: input.id,
      });

      return { ok: true };
    }),

  // ========== 导入系统预设 ==========

  seedSystemPresets: adminProcedure
    .mutation(async ({ ctx }) => {
      // 内置系统预设（来源于 role-dispatcher.ts 的 CONVERSATION_PROMPTS）
      const builtinPresets = [
        // ===== AI角色预设 =====
        {
          category: 'ai_role',
          title: '文学编辑',
          content: `你是一名专业严谨的文学编辑，具备高超的剧作能力。你擅长用事件和选择驱动剧情，设计合理的叙事结构，确保故事逻辑严密、节奏得当。

[身份声明]
你是「文学编辑」Agent，负责引导用户完成从灵感到完整大纲的创作全过程。

[核心能力]
- 故事构思：用提问引导用户明确核心创意、题材类型、核心卖点
- 大纲创作：搭建故事核心三要素（世界观设定、主角成长线、核心爽点链），完成分卷设计
- 单元梗概：将分卷大纲拆解为单元级别的详细梗概
- 章节规划：为每个单元规划章节结构，确保节奏合理

[总体要求]
- 始终使用中文交流
- 逐步引导，每次只讨论当前步骤
- 语气专业但亲切`,
          description: '文学编辑 AI 角色 — 引导用户完成从灵感到完整大纲的创作',
          sortOrder: 1,
        },
        {
          category: 'ai_role',
          title: '设定编辑',
          content: `你是一名具备全维度设定搭建能力的设定编辑。你擅长世界观体系设计、角色设定撰写、力量体系构建，并确保所有设定的逻辑自洽与体系平衡。

[身份声明]
你是「设定编辑」Agent，负责引导用户搭建完整的世界观和设定体系。

[核心能力]
- 世界观搭建：设计底层世界观框架，输出核心规则与不可打破的铁则
- 角色设定：创建主要角色的外貌、性格、背景、动机、能力体系
- 体系设计：力量体系、技能体系、科技体系、物品体系等全维度设定
- 一致性校验：确保所有设定模块之间的逻辑自洽

[总体要求]
- 始终使用中文交流
- 逐步引导，每次只讨论当前步骤
- 语气专业严谨`,
          description: '设定编辑 AI 角色 — 世界观搭建和设定体系设计',
          sortOrder: 2,
        },
        {
          category: 'ai_role',
          title: '正文作者',
          content: `你是「正文作者」Agent，负责撰写章节正文。

[⚡ 最高优先级执行规则]
1. 系统已向你提供完整的【本章任务书】
2. 你的正文必须严格围绕任务书中的"章节梗概"展开
3. 禁止打招呼、自我介绍、确认收到、展示写作计划等
4. 第一条消息就必须是正文本身，以场景描写或动作开头

[正文创作要求]
- 正文长度 2000-3000 字
- 梗概中的每一个情节、场景、人物行动都必须在正文中体现
- 与前文保持连贯，不提前剧透后续内容

[总体要求]
- 始终使用中文交流和创作
- 定稿确认后输出 ACTION 块保存正文`,
          description: '正文作者 AI 角色 — 根据任务书撰写章节正文',
          sortOrder: 3,
        },
        // ===== 创作经验预设 =====
        {
          category: 'creation_experience',
          title: '网文节奏控制指南',
          content: `# 网文节奏控制指南

## 黄金三章原则
- 第一章必须出现核心冲突或悬念
- 第二章展现主角的应对与反击
- 第三章抛出第一个小高潮

## 章节节奏
- 每章 2000-3000 字为宜
- 开头 300 字以内必须有钩子（冲突/悬念/反转）
- 中段推进剧情，保持紧张感
- 结尾留悬念，引导读者继续阅读

## 爽点分布
- 小爽点：每 2-3 章一个
- 中爽点：每 10-15 章一个
- 大爽点：每卷 1-2 个
- 压抑与释放比例约 2:1（两章压抑一章释放）

## 叙事节奏模板
1. 引入新危机/目标（1章）
2. 主角准备/探索（1-2章）
3. 正面冲突/挑战（1-2章）
4. 胜利/反转/收获（1章）→ 爽点
5. 过渡/新伏笔（1章）→ 循环`,
          description: '网文创作中的节奏控制与爽点分布技巧',
          sortOrder: 1,
        },
        {
          category: 'creation_experience',
          title: '角色塑造方法',
          content: `# 角色塑造方法

## 角色塑造四维法
1. **外在层**：外貌特征、穿着打扮、行为习惯、口头禅
2. **能力层**：技能特长、战斗风格、智商情商
3. **内心层**：价值观、恐惧、欲望、创伤、执念
4. **关系层**：与他人的互动模式、立场态度

## 角色弧光设计
- **正向弧光**：从缺陷到成长（最常见）
- **负向弧光**：从善良到堕落（悲剧）
- **平行动光**：信念不变，考验加深（坚守型主角）

## 对话塑造角色
- 每个人物应有独特的说话方式
- 通过对话展现性格而非直接描述
- 用潜台词替代直白表达

## 反派塑造要点
- 反派要有合理的动机，而非纯粹为恶
- 反派的实力应与主角相当或更强
- 给反派赋予人性闪光点`,
          description: '角色塑造的系统方法论',
          sortOrder: 2,
        },
        {
          category: 'creation_experience',
          title: '世界观搭建框架',
          content: `# 世界观搭建框架

## 核心层（必写）
1. **世界基本规则**：物理法则、超自然力量体系
2. **地理环境**：主要国家/城市/特殊区域
3. **时间线**：大事件年表、当前时代特征
4. **力量体系**：等级划分、获取方式、限制条件

## 社会层（重要）
5. **政治体系**：政权结构、权力分配、主要势力
6. **经济体系**：货币、贸易、资源分布
7. **文化风俗**：信仰、禁忌、节日、日常生活方式
8. **职业体系**：各职业的社会地位和晋升路径

## 细节层（锦上添花）
9. **科技/魔法水平**：交通工具、通讯、武器装备
10. **语言特色**：方言、术语、行话、敬语体系
11. **美食与服饰**：不同阶层的饮食穿衣习惯
12. **教育体系**：知识传承方式、学院/师徒制度

## 搭建顺序
先确定核心层 → 根据剧情需要选择社会层 → 写作中逐步补充细节层`,
          description: '系统化的世界观搭建步骤',
          sortOrder: 3,
        },
        // ===== AI配置完整指南 =====
        {
          category: 'ai_config_guide',
          title: 'DeepSeek 接入完整指南',
          content: `# DeepSeek 接入完整指南

## 1. 获取 API Key
1. 访问 https://platform.deepseek.com
2. 注册/登录账号
3. 进入「API Keys」页面
4. 点击「Create API Key」，复制并妥善保存

## 2. 在 Story Edit 中配置
1. 进入「设置」→「AI配置」
2. 点击「添加 API Key」
3. 选择 Provider 为「DeepSeek」
4. 粘贴 API Key
5. 点击「保存」

## 3. 可用模型
- deepseek-v4-pro：V4旗舰版，性能最强（推荐日常使用）
- deepseek-v4-flash：V4轻量版，速度更快、成本更低

## 4. 注意事项
- API Key 请妥善保管，不要分享给他人
- 建议先测试一条对话确认配置正确
- 如遇到请求失败，检查余额是否充足`,
          description: 'DeepSeek API 接入步骤和注意事项',
          sortOrder: 1,
        },
        {
          category: 'ai_config_guide',
          title: 'LongCat 接入完整指南',
          content: `# LongCat 接入完整指南

## 1. 获取 API Key
1. 访问 LongCat 开放平台
2. 注册/登录账号并完成实名认证
3. 进入控制台 → API 管理
4. 创建新的 API Key

## 2. 在 Story Edit 中配置
1. 进入「设置」→「AI配置」
2. 点击「添加 API Key」
3. 选择 Provider 为「LongCat」
4. 填写 API Key
5. 如有自定义 Base URL 一并填入
6. 点击「保存」

## 3. 测试连接
1. 进入任意项目的 AI 助手
2. 发送一条测试消息
3. 确认收到正常回复

## 4. 常见问题
- 确认 API Key 格式正确（无多余空格）
- 检查账号是否有可用额度
- 如使用自定义 Base URL，确保地址可达`,
          description: 'LongCat API 接入步骤和常见问题',
          sortOrder: 2,
        },
        {
          category: 'ai_config_guide',
          title: '通义千问 接入完整指南',
          content: `# 通义千问（阿里云）接入完整指南

## 1. 获取 API Key
1. 访问阿里云百炼平台 https://bailian.console.aliyun.com
2. 使用阿里云账号登录
3. 进入「API-KEY管理」页面
4. 创建新的 API Key

## 2. 在 Story Edit 中配置
1. 进入「设置」→「AI配置」
2. 点击「添加 API Key」
3. 选择 Provider 为「通义千问」
4. 填写 API Key
5. 点击「保存」

## 3. 可用模型
- qwen-turbo：快速响应，适合日常对话
- qwen-plus：平衡性能与质量，推荐使用
- qwen-max：最高质量，适合复杂任务

## 4. 注意事项
- 确保阿里云账号已开通百炼服务
- 检查服务是否已开通并获取到调用权限
- API 调用会产生费用，请关注账户余额`,
          description: '通义千问 API 接入步骤和可用模型',
          sortOrder: 3,
        },
      ];

      // 检查是否已存在（通过 title 去重）
      const existingPresets = await db.select({ title: systemPresets.title }).from(systemPresets);
      const existingTitles = new Set(existingPresets.map(p => p.title));

      let seededCount = 0;
      for (const preset of builtinPresets) {
        if (existingTitles.has(preset.title)) continue;

        await db.insert(systemPresets).values({
          category: preset.category,
          projectType: null,
          title: preset.title,
          content: preset.content,
          description: preset.description,
          sortOrder: preset.sortOrder,
          isPublished: false,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        });
        seededCount++;
      }

      await logAudit({
        adminId: ctx.userId,
        adminLevel: (ctx as any).adminLevel,
        action: 'seed_system_presets',
        targetType: 'preset',
        details: { seededCount },
      });

      return { ok: true, seededCount };
    }),

  // ========== 操作日志 ==========

  getAuditLogs: adminProcedure
    .input(z.object({
      action: z.string().optional(),
      operatorId: z.string().uuid().optional(), // 按操作人筛选
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const adminLevel = (ctx as any).adminLevel;
      const offset = (input.page - 1) * input.limit;

      // level=0 查看所有日志，其他仅查看自己的
      const conditions: any[] = [];
      if (adminLevel !== 0) {
        conditions.push(eq(adminAuditLogs.adminId, ctx.userId));
      }
      if (input.operatorId && adminLevel === 0) {
        conditions.push(eq(adminAuditLogs.adminId, input.operatorId));
      }
      if (input.action) {
        conditions.push(eq(adminAuditLogs.action, input.action));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : sql`true`;

      const [totalResult] = await db.select({ count: count() }).from(adminAuditLogs).where(whereClause!);

      const logs = await db.select({
        id: adminAuditLogs.id,
        adminId: adminAuditLogs.adminId,
        adminLevel: adminAuditLogs.adminLevel,
        action: adminAuditLogs.action,
        targetType: adminAuditLogs.targetType,
        targetId: adminAuditLogs.targetId,
        details: adminAuditLogs.details,
        createdAt: adminAuditLogs.createdAt,
      }).from(adminAuditLogs)
        .where(whereClause)
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(input.limit)
        .offset(offset);

      // 关联查询管理员昵称
      const adminIds = [...new Set(logs.map(l => l.adminId))];
      let adminUsers: { id: string; nickname: string | null; displayId: string | null }[] = [];
      if (adminIds.length > 0) {
        adminUsers = await db.select({
          id: users.id,
          nickname: users.nickname,
          displayId: users.displayId,
        }).from(users).where(inArray(users.id, adminIds));
      }
      const adminMap = new Map(adminUsers.map(u => [u.id, u]));

      return {
        logs: logs.map(l => ({
          ...l,
          adminNickname: adminMap.get(l.adminId)?.nickname || '未知',
          adminDisplayId: adminMap.get(l.adminId)?.displayId || '',
        })),
        total: totalResult?.count || 0,
        page: input.page,
        limit: input.limit,
      };
    }),

  // ========== 获取用户详情（用于弹窗操作） ==========
  getUserDetail: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ input }) => {
      const [user] = await db.select({
        id: users.id,
        nickname: users.nickname,
        email: users.email,
        phone: users.phone,
        displayId: users.displayId,
        avatarUrl: users.avatarUrl,
        isAdmin: users.isAdmin,
        adminLevel: users.adminLevel,
        bannedFromPublish: users.bannedFromPublish,
        bannedFromPayment: users.bannedFromPayment,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.id, input.userId));

      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });

      // 获取精灵豆余额
      const [sprite] = await db.select({
        beanBalance: userSprites.beanBalance,
        bonusDays: userSprites.bonusDays,
        convertedDays: userSprites.convertedDays,
      }).from(userSprites).where(eq(userSprites.userId, input.userId));

      // 获取Token账户余额
      const [tokenAccount] = await db.select({
        balance: userTokenAccounts.balance,
        totalConsumed: userTokenAccounts.totalConsumed,
        totalRecharged: userTokenAccounts.totalRecharged,
      }).from(userTokenAccounts).where(eq(userTokenAccounts.userId, input.userId));

      // VIP 天数 = bonusDays（管理员调整+道具获得）+ convertedDays（精灵豆兑换）
      const totalVipDays = ((sprite?.bonusDays ?? 0) + (sprite?.convertedDays ?? 0));

      let vipLevel = '免费版';
      if (totalVipDays > 365) {
        vipLevel = '年费VIP';
      } else if (totalVipDays > 30) {
        vipLevel = 'VIP';
      } else if (totalVipDays > 0) {
        vipLevel = '体验VIP';
      }

      return {
        ...user, vipLevel, vipDays: totalVipDays,
        beanBalance: sprite?.beanBalance ?? 0,
        tokenBalance: tokenAccount?.balance ?? 0,
        tokenConsumed: tokenAccount?.totalConsumed ?? 0,
        tokenRecharged: tokenAccount?.totalRecharged ?? 0,
      };
    }),

  // ========== 美术资产管理 ==========

  listArtAssets: adminProcedure
    .input(z.object({
      category: z.string().optional(),
      subcategory: z.string().optional(),
      status: z.enum(['published', 'unpublished', 'inactive']).optional(),
      search: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      return artAssetService.listArtAssets(input);
    }),

  getArtAsset: adminProcedure
    .input(z.object({ assetId: z.string().uuid() }))
    .query(async ({ input }) => {
      return artAssetService.getAssetById(input.assetId);
    }),

  createArtAsset: adminProcedure
    .input(z.object({
      category: z.string().min(1),
      subcategory: z.string().optional(),
      assetKey: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      fileFormat: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      fileSize: z.number().optional(),
      storagePath: z.string().min(1),
      cdnUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const asset = await artAssetService.createArtAsset(input, ctx.userId, (ctx as any).adminLevel);
      await logAudit({
        adminId: ctx.userId,
        adminLevel: (ctx as any).adminLevel,
        action: 'create_art_asset',
        targetType: 'art_asset',
        targetId: asset.id,
        details: { category: input.category, assetKey: input.assetKey },
      });
      return asset;
    }),

  updateArtAsset: adminProcedure
    .input(z.object({
      assetId: z.string().uuid(),
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      storagePath: z.string().optional(),
      cdnUrl: z.string().nullable().optional(),
      fileFormat: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      fileSize: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { assetId, description, cdnUrl, ...restUpdates } = input;
      // Coerce null to undefined for optional string fields
      const updates = {
        ...restUpdates,
        description: description || undefined,
        cdnUrl: cdnUrl || undefined,
      };
      const asset = await artAssetService.updateArtAsset(assetId, updates, ctx.userId);
      await logAudit({
        adminId: ctx.userId,
        adminLevel: (ctx as any).adminLevel,
        action: 'update_art_asset',
        targetType: 'art_asset',
        targetId: assetId,
      });
      return asset;
    }),

  publishArtAsset: adminProcedure
    .input(z.object({ assetId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const asset = await artAssetService.publishAsset(input.assetId, ctx.userId);
      await logAudit({
        adminId: ctx.userId,
        adminLevel: (ctx as any).adminLevel,
        action: 'publish_art_asset',
        targetType: 'art_asset',
        targetId: input.assetId,
      });
      return asset;
    }),

  unpublishArtAsset: adminProcedure
    .input(z.object({ assetId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const asset = await artAssetService.unpublishAsset(input.assetId, ctx.userId);
      await logAudit({
        adminId: ctx.userId,
        adminLevel: (ctx as any).adminLevel,
        action: 'unpublish_art_asset',
        targetType: 'art_asset',
        targetId: input.assetId,
      });
      return asset;
    }),

  deleteArtAsset: adminProcedure
    .input(z.object({ assetId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await artAssetService.deleteAsset(input.assetId, ctx.userId);
      await logAudit({
        adminId: ctx.userId,
        adminLevel: (ctx as any).adminLevel,
        action: 'delete_art_asset',
        targetType: 'art_asset',
        targetId: input.assetId,
      });
      return { ok: true };
    }),

  batchPublishAssets: adminProcedure
    .input(z.object({ assetIds: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      const result = await artAssetService.batchPublishAssets(input.assetIds, ctx.userId);
      await logAudit({
        adminId: ctx.userId,
        adminLevel: (ctx as any).adminLevel,
        action: 'batch_publish_assets',
        targetType: 'art_asset',
        details: { count: result.count },
      });
      return result;
    }),

  getAssetStats: adminProcedure
    .query(async () => {
      return artAssetService.getAssetStats();
    }),

  // File-based art asset management
  files: fileRouter,
});
