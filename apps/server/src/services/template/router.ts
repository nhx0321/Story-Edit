// 模板广场 tRPC 路由 — 完整版
import { z } from 'zod';
import { eq, and, desc, asc, sql, or, ilike, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, adminProcedure } from '../../trpc';
import { db } from '../../db';
import {
  templates, templatePurchases, templateRatings, templateLikes, userTemplates,
  templateVersions, templateComments, transactions,
  disclaimers, users, userSprites, spriteBeanTransactions,
} from '../../db/schema';
import { recordBeanTransaction } from '../sprite/bean-service';

async function isTemplateCreationAllowed(_userId: string) {
  return true;
}

async function isTemplateImportAllowed(_userId: string) {
  return true;
}

// 辅助：给模板创作者增加精灵豆
async function rewardCreator(creatorId: string, amount: number, description: string, templateId: string) {
  await recordBeanTransaction({
    userId: creatorId,
    type: 'income',
    amount,
    description,
    relatedType: 'template',
    relatedId: templateId,
  });
}

// 辅助：获取预览内容（未付费用户限制）
function getLimitedPreview(content: string): string {
  let newlineCount = 0;
  let previewEnd = content.length;

  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === '\n') {
      newlineCount += 1;
      if (newlineCount === 5) {
        previewEnd = i;
        break;
      }
    }
  }

  const fiveLines = content.slice(0, previewEnd);
  const oneThird = content.slice(0, Math.ceil(content.length / 3));
  return fiveLines.length < oneThird.length ? fiveLines : oneThird;
}

export const templateRouter = router({
  // ===== 模板广场公共接口 =====

  // 获取模板列表
  list: publicProcedure
    .input(z.object({
      source: z.enum(['official', 'user']).optional(),
      category: z.string().optional(),
      sortBy: z.enum(['hot', 'rating', 'price', 'newest']).default('newest'),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const where = [eq(templates.auditStatus, 'approved')];
      if (input.source) where.push(eq(templates.source, input.source));
      if (input.category) where.push(eq(templates.category, input.category));

      const orderBy = input.sortBy === 'hot' ? desc(templates.viewCount)
        : input.sortBy === 'rating' ? desc(templates.importCount)
        : input.sortBy === 'price' ? asc(templates.price)
        : desc(templates.createdAt);

      const items = await db.select({
        id: templates.id,
        title: templates.title,
        description: templates.description,
        source: templates.source,
        category: templates.category,
        price: templates.price,
        tipAmount: templates.tipAmount,
        viewCount: templates.viewCount,
        importCount: templates.importCount,
        commentsCount: templates.commentsCount,
        likesCount: templates.likesCount,
        uploaderId: templates.uploaderId,
        createdAt: templates.createdAt,
      })
        .from(templates)
        .where(and(...where))
        .orderBy(orderBy)
        .limit(input.limit)
        .offset(input.offset);

      // 获取平均评分
      const itemsWithRatings = await Promise.all(items.map(async (item) => {
        const [ratingResult] = await db.select({
          avg: sql<number>`COALESCE(AVG(${templateRatings.score}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
          .from(templateRatings)
          .where(eq(templateRatings.templateId, item.id));

        return {
          ...item,
          avgRating: Number(ratingResult?.avg) || 0,
          ratingCount: Number(ratingResult?.count) || 0,
        };
      }));

      // 批量获取上传者信息
      const uploaderIds = [...new Set(itemsWithRatings.map(i => i.uploaderId).filter(Boolean))] as string[];
      let uploaderInfo: { id: string; nickname: string | null; displayId: string | null; avatarUrl: string | null }[] = [];
      if (uploaderIds.length > 0) {
        uploaderInfo = await db.select({
          id: users.id,
          nickname: users.nickname,
          displayId: users.displayId,
          avatarUrl: users.avatarUrl,
        }).from(users).where(inArray(users.id, uploaderIds));
      }
      const userMap = new Map(uploaderInfo.map(u => [u.id, u]));

      return itemsWithRatings.map(item => ({
        ...item,
        uploader: item.uploaderId ? userMap.get(item.uploaderId) || null : null,
      }));
    }),

  // 搜索模板
  search: publicProcedure
    .input(z.object({
      query: z.string().min(1),
      category: z.string().optional(),
      sortBy: z.enum(['hot', 'rating', 'price', 'newest']).default('newest'),
    }))
    .query(async ({ input }) => {
      const where = and(
        eq(templates.auditStatus, 'approved'),
        or(
          ilike(templates.title, `%${input.query}%`),
          ilike(templates.description || '', `%${input.query}%`),
        ),
        input.category ? eq(templates.category, input.category) : undefined,
      );

      const orderBy = input.sortBy === 'hot' ? desc(templates.viewCount)
        : input.sortBy === 'rating' ? desc(templates.importCount)
        : input.sortBy === 'price' ? asc(templates.price)
        : desc(templates.createdAt);

      const items = await db.select({
        id: templates.id,
        title: templates.title,
        description: templates.description,
        source: templates.source,
        category: templates.category,
        price: templates.price,
        uploaderId: templates.uploaderId,
        viewCount: templates.viewCount,
        importCount: templates.importCount,
        createdAt: templates.createdAt,
      })
        .from(templates)
        .where(where)
        .orderBy(orderBy)
        .limit(50);

      // 获取平均评分
      const itemsWithRatings = await Promise.all(items.map(async (item) => {
        const [ratingResult] = await db.select({
          avg: sql<number>`COALESCE(AVG(${templateRatings.score}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
          .from(templateRatings)
          .where(eq(templateRatings.templateId, item.id));

        return {
          ...item,
          avgRating: Number(ratingResult?.avg) || 0,
          ratingCount: Number(ratingResult?.count) || 0,
        };
      }));

      // 批量获取上传者信息
      const uploaderIds = [...new Set(itemsWithRatings.map(i => i.uploaderId).filter(Boolean))] as string[];
      let uploaderInfo: { id: string; nickname: string | null; displayId: string | null; avatarUrl: string | null }[] = [];
      if (uploaderIds.length > 0) {
        uploaderInfo = await db.select({
          id: users.id,
          nickname: users.nickname,
          displayId: users.displayId,
          avatarUrl: users.avatarUrl,
        }).from(users).where(inArray(users.id, uploaderIds));
      }
      const userMap = new Map(uploaderInfo.map(u => [u.id, u]));

      return itemsWithRatings.map(item => ({
        ...item,
        uploader: item.uploaderId ? userMap.get(item.uploaderId) || null : null,
      }));
    }),

  // 获取模板详情
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      // 增加浏览量
      await db.update(templates)
        .set({ viewCount: sql`${templates.viewCount} + 1` })
        .where(eq(templates.id, input.id));

      const [item] = await db.select().from(templates).where(eq(templates.id, input.id));
      if (!item) throw new TRPCError({ code: 'NOT_FOUND', message: '模板不存在' });
      if (item.auditStatus !== 'approved') throw new TRPCError({ code: 'FORBIDDEN', message: '模板未通过审核' });

      // 获取评分
      const [ratingResult] = await db.select({
        avg: sql<number>`COALESCE(AVG(${templateRatings.score}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
        .from(templateRatings)
        .where(eq(templateRatings.templateId, input.id));

      // 获取点赞数
      const [likeResult] = await db.select({
        count: sql<number>`COUNT(*)`,
      })
        .from(templateLikes)
        .where(eq(templateLikes.templateId, input.id));

      // 内容预览限制
      const userId = (ctx as any).userId;
      const isOwner = item.uploaderId === userId;
      const isPurchased = userId ? await isTemplatePurchased(userId, item.id) : false;
      const isLiked = userId ? await isTemplateLiked(userId, item.id) : false;
      const isFree = (item.price ?? 0) === 0;

      let displayContent: string | null = null;
      let isLimited = false;

      if (isFree || isPurchased || isLiked || isOwner) {
        displayContent = item.content;
      } else {
        // 付费模板未购买：只返回预览
        displayContent = item.preview || getLimitedPreview(item.content);
        isLimited = true;
      }

      // 获取上传者信息
      let uploader = null;
      if (item.uploaderId) {
        const [u] = await db.select({
          id: users.id,
          nickname: users.nickname,
          displayId: users.displayId,
          avatarUrl: users.avatarUrl,
        }).from(users).where(eq(users.id, item.uploaderId));
        if (u) {
          uploader = u;
        }
      }

      return {
        ...item,
        content: displayContent,
        avgRating: Number(ratingResult?.avg) || 0,
        ratingCount: Number(ratingResult?.count) || 0,
        likeCount: Number(likeResult?.count) || 0,
        isLimited,
        isPurchased,
        isLiked,
        isOwner,
        isFree,
        uploader,
      };
    }),

  // 获取分类列表
  categories: publicProcedure.query(async () => {
    const result = await db.select({
      category: templates.category,
      count: sql<number>`COUNT(*)`,
    })
      .from(templates)
      .where(eq(templates.auditStatus, 'approved'))
      .groupBy(templates.category)
      .orderBy(asc(templates.category));

    return result.filter(r => r.category);
  }),

  // 点赞（消耗 1 精灵豆，创作者获得1豆）
  like: protectedProcedure
    .input(z.object({ templateId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.select()
        .from(templateLikes)
        .where(and(
          eq(templateLikes.templateId, input.templateId),
          eq(templateLikes.userId, ctx.userId),
        ));

      if (existing.length > 0) {
        // 取消点赞：退回精灵豆，创作者扣回
        await db.delete(templateLikes).where(eq(templateLikes.id, existing[0].id));
        await db.update(templates)
          .set({ likesCount: sql`${templates.likesCount} - 1` })
          .where(eq(templates.id, input.templateId));

        // 退回1豆给点赞者
        const [sprite] = await db.select({ beanBalance: userSprites.beanBalance })
          .from(userSprites).where(eq(userSprites.userId, ctx.userId));
        if (sprite) {
          await recordBeanTransaction({
            userId: ctx.userId,
            type: 'refund',
            amount: 1,
            description: '取消点赞退回',
            relatedType: 'template',
            relatedId: input.templateId,
          });
        }

        // 从创作者扣回1豆
        const [tpl] = await db.select({ uploaderId: templates.uploaderId }).from(templates).where(eq(templates.id, input.templateId));
        if (tpl && tpl.uploaderId && tpl.uploaderId !== ctx.userId) {
          await recordBeanTransaction({
            userId: tpl.uploaderId,
            type: 'consume',
            amount: -1,
            description: '点赞被取消退回',
            relatedType: 'template',
            relatedId: input.templateId,
          });
        }

        return { liked: false };
      }

      // 检查余额
      const [sprite] = await db.select({ beanBalance: userSprites.beanBalance })
        .from(userSprites).where(eq(userSprites.userId, ctx.userId));
      if (!sprite || (sprite.beanBalance ?? 0) < 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '精灵豆余额不足（需要1豆）' });
      }

      // 消耗1豆
      await recordBeanTransaction({
        userId: ctx.userId,
        type: 'consume',
        amount: -1,
        description: '模板点赞',
        relatedType: 'template',
        relatedId: input.templateId,
      });

      // 创作者获得1豆收益
      const [tpl] = await db.select({ uploaderId: templates.uploaderId }).from(templates).where(eq(templates.id, input.templateId));
      if (tpl && tpl.uploaderId && tpl.uploaderId !== ctx.userId) {
        await rewardCreator(tpl.uploaderId, 1, '点赞收益', input.templateId);
      }

      await db.insert(templateLikes).values({
        templateId: input.templateId,
        userId: ctx.userId,
      });
      await db.update(templates)
        .set({ likesCount: sql`${templates.likesCount} + 1` })
        .where(eq(templates.id, input.templateId));
      return { liked: true };
    }),

  // 评分
  rate: protectedProcedure
    .input(z.object({ templateId: z.string().uuid(), score: z.number().min(1).max(5) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.select()
        .from(templateRatings)
        .where(and(
          eq(templateRatings.templateId, input.templateId),
          eq(templateRatings.userId, ctx.userId),
        ));

      if (existing.length > 0) {
        await db.update(templateRatings)
          .set({ score: input.score })
          .where(eq(templateRatings.id, existing[0].id));
      } else {
        await db.insert(templateRatings).values({
          templateId: input.templateId,
          userId: ctx.userId,
          score: input.score,
        });
      }
      return { ok: true };
    }),

  // ===== 评论功能 =====

  // 获取模板评论
  getComments: publicProcedure
    .input(z.object({ templateId: z.string().uuid(), parentId: z.string().uuid().nullish() }))
    .query(async ({ input }) => {
      const where = [eq(templateComments.templateId, input.templateId)];
      if (input.parentId) {
        where.push(eq(templateComments.parentCommentId, input.parentId));
      } else {
        where.push(sql`${templateComments.parentCommentId} IS NULL`);
      }

      const comments = await db.select({
        id: templateComments.id,
        content: templateComments.content,
        userId: templateComments.userId,
        createdAt: templateComments.createdAt,
        updatedAt: templateComments.updatedAt,
      })
        .from(templateComments)
        .where(and(...where))
        .orderBy(desc(templateComments.createdAt))
        .limit(50);

      return comments;
    }),

  // 添加评论
  addComment: protectedProcedure
    .input(z.object({ templateId: z.string().uuid(), content: z.string().min(1), parentId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [comment] = await db.insert(templateComments).values({
        templateId: input.templateId,
        userId: ctx.userId,
        content: input.content,
        parentCommentId: input.parentId || null,
      }).returning();

      await db.update(templates)
        .set({ commentsCount: sql`${templates.commentsCount} + 1` })
        .where(eq(templates.id, input.templateId));

      return comment;
    }),

  // 删除评论
  deleteComment: protectedProcedure
    .input(z.object({ commentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(templateComments)
        .where(and(
          eq(templateComments.id, input.commentId),
          eq(templateComments.userId, ctx.userId),
        ));
      return { ok: true };
    }),

  // ===== 个人模板资产 =====

  // 导入模板到个人资产（消耗 10 精灵豆，创作者获得10豆）
  importTemplate: protectedProcedure
    .input(z.object({
      templateId: z.string().uuid(),
      projectId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [template] = await db.select().from(templates).where(eq(templates.id, input.templateId));
      if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: '模板不存在' });

      // 检查精灵豆余额（10豆）
      const [sprite] = await db.select({ beanBalance: userSprites.beanBalance })
        .from(userSprites).where(eq(userSprites.userId, ctx.userId));
      if (!sprite || (sprite.beanBalance ?? 0) < 10) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '精灵豆余额不足（需要10豆）' });
      }

      // 扣除10豆
      await recordBeanTransaction({
        userId: ctx.userId,
        type: 'consume',
        amount: -10,
        description: '导入模板',
        relatedType: 'template',
        relatedId: input.templateId,
      });

      // 创作者获得10豆收益
      if (template.uploaderId && template.uploaderId !== ctx.userId) {
        await rewardCreator(template.uploaderId, 10, '导入收益', input.templateId);
      }

      // 检查购买要求
      if (template.source === 'user' && (template.price ?? 0) > 0) {
        const purchase = await db.select()
          .from(templatePurchases)
          .where(and(
            eq(templatePurchases.templateId, input.templateId),
            eq(templatePurchases.userId, ctx.userId),
          ));
        if (purchase.length === 0) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '请先购买此模板' });
        }
      }

      if (!(await isTemplateImportAllowed(ctx.userId))) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '当前账号暂不可继续导入模板',
        });
      }

      // 增加导入计数
      await db.update(templates)
        .set({ importCount: sql`${templates.importCount} + 1` })
        .where(eq(templates.id, input.templateId));

      // 保存到用户资产
      const [userTemplate] = await db.insert(userTemplates).values({
        userId: ctx.userId,
        projectId: input.projectId || null,
        templateId: input.templateId,
        title: template.title,
        content: template.content,
        source: 'import',
        canRepublish: false, // 购买的模板不可重新发布
        isFromPurchase: template.source === 'user' && (template.price ?? 0) > 0,
      }).returning();

      return userTemplate;
    }),

  // 从市场导入已购模板（免费，不消耗精灵豆）
  importFromMarketplace: protectedProcedure
    .input(z.object({
      templateId: z.string().uuid(),
      projectId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 验证用户已购买此模板
      const [purchase] = await db.select()
        .from(templatePurchases)
        .where(and(
          eq(templatePurchases.templateId, input.templateId),
          eq(templatePurchases.userId, ctx.userId),
        ));
      if (!purchase) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '请先购买此模板' });
      }

      const [template] = await db.select().from(templates).where(eq(templates.id, input.templateId));
      if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: '模板不存在' });

      // 保存到用户资产（免费）
      const [userTemplate] = await db.insert(userTemplates).values({
        userId: ctx.userId,
        projectId: input.projectId,
        templateId: input.templateId,
        title: template.title,
        content: template.content,
        source: 'import',
        canRepublish: false,
        isFromPurchase: true,
      }).returning();

      return userTemplate;
    }),

  // 智能导入：根据模板 category 自动导入到项目对应位置（消耗 10 精灵豆）
  smartImport: protectedProcedure
    .input(z.object({
      templateId: z.string().uuid(),
      projectId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [template] = await db.select().from(templates).where(eq(templates.id, input.templateId));
      if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: '模板不存在' });

      // 检查精灵豆余额（10豆）
      const [sprite] = await db.select({ beanBalance: userSprites.beanBalance })
        .from(userSprites).where(eq(userSprites.userId, ctx.userId));
      if (!sprite || (sprite.beanBalance ?? 0) < 10) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '精灵豆余额不足（需要10豆）' });
      }

      // 扣除10豆
      await recordBeanTransaction({
        userId: ctx.userId,
        type: 'consume',
        amount: -10,
        description: '智能导入模板',
        relatedType: 'template',
        relatedId: input.templateId,
      });

      // 创作者获得10豆收益
      if (template.uploaderId && template.uploaderId !== ctx.userId) {
        await rewardCreator(template.uploaderId, 10, '智能导入收益', input.templateId);
      }

      // 检查购买要求
      if (template.source === 'user' && (template.price ?? 0) > 0) {
        const purchase = await db.select()
          .from(templatePurchases)
          .where(and(
            eq(templatePurchases.templateId, input.templateId),
            eq(templatePurchases.userId, ctx.userId),
          ));
        if (purchase.length === 0) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '请先购买此模板' });
        }
      }

      if (!(await isTemplateImportAllowed(ctx.userId))) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '当前账号暂不可继续导入模板',
        });
      }

      // 验证项目权限
      const { projects } = await import('../../db/schema');
      const [project] = await db.select().from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)));
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: '项目不存在或无权限' });

      const { settings, aiRoles } = await import('../../db/schema');
      let importTarget = '';
      let importTargetLabel = '';

      // AI 角色映射：key → 中文名称
      const roleNames: Record<string, string> = {
        editor: '文学编辑参考',
        setting_editor: '设定编辑参考',
        writer: '正文作者参考',
      };

      switch (template.category) {
        case 'setting': {
          // 解析设定模板内容，创建设定条目
          // 尝试解析 【分类】标题\n\n内容 格式
          const contentMatch = template.content.match(/^【([^】]+)】(.+)/s);
          let settingCategory: string = template.category || '通用';
          let title = template.title;
          let content = template.content;
          if (contentMatch) {
            settingCategory = contentMatch[1].trim();
            const titleMatch = contentMatch[2].match(/^([^\n]+)/);
            if (titleMatch) title = titleMatch[1].trim();
            content = contentMatch[2].trim();
          }
          await db.insert(settings).values({
            projectId: input.projectId,
            category: settingCategory,
            title,
            content,
          });
          importTarget = 'setting';
          importTargetLabel = `设定「${title}」`;
          break;
        }
        case 'ai_prompt': {
          // AI角色提示词模板：优先使用 aiTargetRole 匹配目标角色，fallback 到 title 匹配
          let targetRoleKey: string | null = (template as any).aiTargetRole || null;
          let existingRole;

          if (targetRoleKey && roleNames[targetRoleKey]) {
            // 使用 aiTargetRole 字段匹配
            existingRole = await db.select()
              .from(aiRoles)
              .where(and(eq(aiRoles.projectId, input.projectId), eq(aiRoles.role, targetRoleKey)))
              .limit(1);
          } else {
            // Fallback: 按 title 匹配
            existingRole = await db.select()
              .from(aiRoles)
              .where(and(eq(aiRoles.projectId, input.projectId), eq(aiRoles.name, template.title)))
              .limit(1);
          }

          if (existingRole.length === 0) {
            const missingRole = targetRoleKey ? (roleNames[targetRoleKey] || template.title) : template.title;
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `项目中不存在 AI 角色「${missingRole}」，请先在项目中创建该角色后再导入`,
            });
          }
          await db.update(aiRoles)
            .set({ systemPrompt: template.content })
            .where(eq(aiRoles.id, existingRole[0].id));
          importTarget = 'ai_role';
          importTargetLabel = `AI角色「${existingRole[0].name}」`;
          break;
        }
        case 'style':
        case 'structure':
        case 'methodology': {
          // 风格/结构/方法论模板：根据 aiTargetRole 确定目标角色
          let roleKey: string;
          let roleLabel: string;

          const targetRole = (template as any).aiTargetRole;
          if (targetRole && roleNames[targetRole]) {
            roleKey = targetRole;
            roleLabel = roleNames[targetRole];
          } else {
            // Fallback: 按原有逻辑（style→novelist，其他→editor）
            roleKey = template.category === 'style' ? 'novelist' : 'editor';
            roleLabel = template.category === 'style' ? '正文作者参考' : '文学编辑参考';
          }

          const existingRole = await db.select()
            .from(aiRoles)
            .where(and(eq(aiRoles.projectId, input.projectId), eq(aiRoles.role, roleKey)))
            .limit(1);
          if (existingRole.length === 0) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `项目中不存在「${roleLabel}」角色，请先在项目中创建该角色后再导入`,
            });
          }
          // 追加到现有 systemPrompt
          const existingPrompt = existingRole[0].systemPrompt;
          const separator = existingPrompt ? '\n\n---\n\n' : '';
          await db.update(aiRoles)
            .set({ systemPrompt: `${existingPrompt}${separator}【${template.title}】\n${template.content}` })
            .where(eq(aiRoles.id, existingRole[0].id));
          importTarget = 'ai_role';
          importTargetLabel = `${roleLabel}「${template.title}」`;
          break;
        }
        default: {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `不支持的模板分类：${template.category || '未分类'}，模板只能导入到已有的文学编辑、设定编辑、正文作者角色中`,
          });
        }
      }

      // 增加模板导入计数
      await db.update(templates)
        .set({ importCount: sql`${templates.importCount} + 1` })
        .where(eq(templates.id, input.templateId));

      // 保存到用户资产
      await db.insert(userTemplates).values({
        userId: ctx.userId,
        projectId: input.projectId,
        templateId: input.templateId,
        title: template.title,
        content: template.content,
        source: 'import',
        canRepublish: false,
        isFromPurchase: template.source === 'user' && (template.price ?? 0) > 0,
        category: template.category,
        aiTargetRole: (template as any).aiTargetRole || null,
      }).onConflictDoNothing();

      // 标记项目为从付费模板导入（禁用导出）
      const isPaidTemplate = template.source === 'user' && (template.price ?? 0) > 0;
      if (isPaidTemplate) {
        const currentConfig = (project.config || {}) as Record<string, unknown>;
        const { projects } = await import('../../db/schema');
        await db.update(projects)
          .set({
            config: { ...currentConfig, importedFromTemplate: input.templateId, isPaidTemplate: true },
            updatedAt: new Date(),
          })
          .where(eq(projects.id, input.projectId));
      }
      // 保存指纹（付费模板）
      if ((template.price ?? 0) > 0 && template.content) {
        const { saveTemplateFingerprint } = await import('./content-fingerprint');
        saveTemplateFingerprint(input.templateId, template.content).catch(() => {});
      }

      return {
        ok: true,
        importTarget,
        importTargetLabel,
        message: `已导入到${importTargetLabel}`,
      };
    }),

  // 获取用户已导入/创建的模板
  myTemplates: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid().optional(),
      category: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const where = [
        eq(userTemplates.userId, ctx.userId),
        sql`${userTemplates.deletedAt} IS NULL`,
      ];
      if (input.projectId) where.push(eq(userTemplates.projectId, input.projectId));
      if (input.category) where.push(eq(userTemplates.category, input.category));

      return db.select()
        .from(userTemplates)
        .where(and(...where))
        .orderBy(desc(userTemplates.updatedAt));
    }),

  // 获取已删除的模板（30天内）
  myDeletedTemplates: protectedProcedure.query(async ({ ctx }) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return db.select()
      .from(userTemplates)
      .where(and(
        eq(userTemplates.userId, ctx.userId),
        sql`${userTemplates.deletedAt} IS NOT NULL`,
        sql`${userTemplates.deletedAt} > ${thirtyDaysAgo}`,
      ))
      .orderBy(desc(userTemplates.deletedAt));
  }),

  // 恢复已删除的模板
  restoreDeletedTemplate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db.update(userTemplates)
        .set({ deletedAt: null })
        .where(and(
          eq(userTemplates.id, input.id),
          eq(userTemplates.userId, ctx.userId),
          sql`${userTemplates.deletedAt} IS NOT NULL`,
          sql`${userTemplates.deletedAt} > NOW() - INTERVAL '30 days'`,
        ))
        .returning();

      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: '模板不存在或已超过30天' });
      return { ok: true };
    }),

  // 软删除用户模板
  deleteMyTemplate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(userTemplates)
        .set({ deletedAt: new Date() })
        .where(and(
          eq(userTemplates.id, input.id),
          eq(userTemplates.userId, ctx.userId),
        ));
      return { ok: true };
    }),

  // ===== 模板创作 — 从项目文件创建 =====

  createFromProject: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      sourceType: z.enum(['setting', 'chapter', 'ai_role', 'memory', 'outline']),
      sourceId: z.string().uuid(),
      title: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await isTemplateCreationAllowed(ctx.userId))) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '当前账号暂不可继续创建模板',
        });
      }

      // 读取源文件内容
      let content = '';
      let defaultTitle = '';

      const { settings, chapters, aiRoles, memoryEntries, volumes, units } = await import('../../db/schema');

      switch (input.sourceType) {
        case 'setting': {
          const [s] = await db.select().from(settings).where(and(eq(settings.id, input.sourceId), eq(settings.projectId, input.projectId)));
          if (!s) throw new TRPCError({ code: 'NOT_FOUND', message: '设定不存在' });
          content = `【${s.category}】${s.title}\n\n${s.content}`;
          defaultTitle = s.title;
          break;
        }
        case 'chapter': {
          const [ch] = await db.select().from(chapters).where(eq(chapters.id, input.sourceId));
          if (!ch) throw new TRPCError({ code: 'NOT_FOUND', message: '章节不存在' });
          // 需要获取最新版本内容
          const { chapterVersions } = await import('../../db/schema');
          const [latestVersion] = await db.select()
            .from(chapterVersions)
            .where(eq(chapterVersions.chapterId, input.sourceId))
            .orderBy(desc(chapterVersions.versionNumber), desc(chapterVersions.subVersionNumber))
            .limit(1);
          content = latestVersion ? latestVersion.content : `【${ch.title}】（无正文内容）`;
          defaultTitle = ch.title;
          break;
        }
        case 'ai_role': {
          const [role] = await db.select().from(aiRoles).where(and(eq(aiRoles.id, input.sourceId), eq(aiRoles.projectId, input.projectId)));
          if (!role) throw new TRPCError({ code: 'NOT_FOUND', message: 'AI角色不存在' });
          content = `【角色：${role.name}】\n\n${role.systemPrompt}`;
          defaultTitle = role.name;
          break;
        }
        case 'memory': {
          const [m] = await db.select().from(memoryEntries).where(and(eq(memoryEntries.id, input.sourceId), eq(memoryEntries.projectId, input.projectId)));
          if (!m) throw new TRPCError({ code: 'NOT_FOUND', message: '经验不存在' });
          content = `【${m.level} ${m.category || '经验'}】\n\n${m.content}`;
          defaultTitle = m.category || '创作经验';
          break;
        }
        case 'outline': {
          // 尝试在 volumes 和 units 中查找
          const [vol] = await db.select().from(volumes).where(eq(volumes.id, input.sourceId));
          if (vol && vol.synopsis) {
            content = `【卷梗概】${vol.title}\n\n${vol.synopsis}`;
            defaultTitle = vol.title;
          } else {
            const [unit] = await db.select().from(units).where(eq(units.id, input.sourceId));
            if (!unit) throw new TRPCError({ code: 'NOT_FOUND', message: '梗概不存在' });
            content = `【单元梗概】${unit.title}\n\n${unit.synopsis || '（无梗概内容）'}`;
            defaultTitle = unit.title;
          }
          break;
        }
      }

      // 映射 category
      const categoryMap: Record<string, string> = {
        setting: 'setting',
        chapter: 'style',
        ai_role: 'ai_prompt',
        memory: 'methodology',
        outline: 'structure',
      };

      const [ut] = await db.insert(userTemplates).values({
        userId: ctx.userId,
        projectId: input.projectId,
        title: input.title || defaultTitle,
        content,
        description: input.description || '',
        source: 'custom',
        category: categoryMap[input.sourceType] || 'methodology',
        canRepublish: true,
      }).returning();

      return ut;
    }),

  // 创建空白模板
  createEmpty: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid().optional(),
      title: z.string().min(1),
      content: z.string().min(1),
      category: z.string().default('methodology'),
      aiTargetRole: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await isTemplateCreationAllowed(ctx.userId))) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '当前账号暂不可继续创建模板',
        });
      }

      const [ut] = await db.insert(userTemplates).values({
        userId: ctx.userId,
        projectId: input.projectId || null,
        title: input.title,
        content: input.content,
        description: input.description || '',
        source: 'custom',
        category: input.category,
        aiTargetRole: input.aiTargetRole || null,
        canRepublish: true,
      }).returning();

      return ut;
    }),

  // 保存/更新用户创建的模板（生成新版本）
  saveMyTemplate: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().optional(),
      content: z.string().min(1),
      description: z.string().optional(),
      category: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 验证模板属于当前用户且未被锁定
      const [existing] = await db.select()
        .from(userTemplates)
        .where(and(
          eq(userTemplates.id, input.id),
          eq(userTemplates.userId, ctx.userId),
          sql`${userTemplates.deletedAt} IS NULL`,
        ));

      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: '模板不存在' });
      if (existing.auditStatus === 'pending' || existing.auditStatus === 'locked') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '模板正在审核中，不可修改' });
      }

      // 保存旧版本
      await db.insert(templateVersions).values({
        userTemplateId: input.id,
        content: existing.content,
        versionNumber: 1, // 简化处理，实际应查询最大版本号+1
      });

      // 更新模板
      const updateData: Record<string, any> = {
        content: input.content,
        updatedAt: new Date(),
      };
      if (input.title) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.category !== undefined) updateData.category = input.category;

      const [updated] = await db.update(userTemplates)
        .set(updateData)
        .where(eq(userTemplates.id, input.id))
        .returning();

      return updated;
    }),

  // 获取模板版本历史
  getTemplateVersions: protectedProcedure
    .input(z.object({ userTemplateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // 验证模板属于当前用户
      const [ut] = await db.select()
        .from(userTemplates)
        .where(and(
          eq(userTemplates.id, input.userTemplateId),
          eq(userTemplates.userId, ctx.userId),
        ));
      if (!ut) throw new TRPCError({ code: 'NOT_FOUND', message: '模板不存在' });

      return db.select()
        .from(templateVersions)
        .where(and(
          eq(templateVersions.userTemplateId, input.userTemplateId),
          sql`${templateVersions.deletedAt} IS NULL`,
        ))
        .orderBy(desc(templateVersions.versionNumber));
    }),

  // 恢复旧版本
  restoreTemplateVersion: protectedProcedure
    .input(z.object({ versionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [version] = await db.select()
        .from(templateVersions)
        .where(eq(templateVersions.id, input.versionId));
      if (!version) throw new TRPCError({ code: 'NOT_FOUND', message: '版本不存在' });

      // 验证模板属于当前用户
      const [ut] = await db.select()
        .from(userTemplates)
        .where(and(
          eq(userTemplates.id, version.userTemplateId),
          eq(userTemplates.userId, ctx.userId),
        ));
      if (!ut) throw new TRPCError({ code: 'FORBIDDEN', message: '无权操作' });

      // 保存当前内容为新版本
      await db.insert(templateVersions).values({
        userTemplateId: version.userTemplateId,
        content: ut.content,
        versionNumber: version.versionNumber + 1,
      });

      // 恢复旧版本
      const [updated] = await db.update(userTemplates)
        .set({ content: version.content, updatedAt: new Date() })
        .where(eq(userTemplates.id, version.userTemplateId))
        .returning();

      return updated;
    }),

  // ===== 发布到模板广场 =====

  publishToMarketplace: protectedProcedure
    .input(z.object({
      userTemplateId: z.string().uuid(),
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.string().optional(),
      aiTargetRole: z.string().optional(),
      disclaimerVersion: z.number().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      // 验证免责声明版本
      const [activeDisclaimer] = await db.select()
        .from(disclaimers)
        .where(eq(disclaimers.isActive, true))
        .limit(1);
      if (!activeDisclaimer) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '系统配置异常，请稍后重试' });
      }
      if (input.disclaimerVersion !== activeDisclaimer.version) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '免责声明已更新，请重新阅读并确认',
        });
      }

      // 验证模板属于当前用户
      const [ut] = await db.select()
        .from(userTemplates)
        .where(and(
          eq(userTemplates.id, input.userTemplateId),
          eq(userTemplates.userId, ctx.userId),
          sql`${userTemplates.deletedAt} IS NULL`,
        ));
      if (!ut) throw new TRPCError({ code: 'NOT_FOUND', message: '模板不存在' });
      if (!ut.canRepublish) throw new TRPCError({ code: 'FORBIDDEN', message: '购买的模板不可重新发布' });
      if (ut.auditStatus === 'pending' || ut.auditStatus === 'locked') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '模板正在审核中' });
      }

      // 创建模板广场记录
      const [template] = await db.insert(templates).values({
        title: input.title,
        description: input.description,
        category: input.category || ut.category,
        aiTargetRole: input.aiTargetRole || ut.aiTargetRole || null,
        content: ut.content,
        preview: getLimitedPreview(ut.content),
        price: 0,
        source: 'user',
        uploaderId: ctx.userId,
        auditStatus: 'pending',
      }).returning();

      // 锁定用户模板
      await db.update(userTemplates)
        .set({
          auditStatus: 'pending',
          templateId: template.id,
        })
        .where(eq(userTemplates.id, input.userTemplateId));

      return { ok: true, templateId: template.id };
    }),

  // 重新提交审核（审核不通过后修改再提交）
  resubmitForReview: protectedProcedure
    .input(z.object({ userTemplateId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [ut] = await db.select()
        .from(userTemplates)
        .where(and(
          eq(userTemplates.id, input.userTemplateId),
          eq(userTemplates.userId, ctx.userId),
        ));
      if (!ut) throw new TRPCError({ code: 'NOT_FOUND', message: '模板不存在' });
      if (!ut.templateId) throw new TRPCError({ code: 'FORBIDDEN', message: '未关联到审核模板' });

      // 更新模板广场内容
      await db.update(templates)
        .set({
          content: ut.content,
          preview: getLimitedPreview(ut.content),
          auditStatus: 'pending',
          reviewReason: null,
        })
        .where(eq(templates.id, ut.templateId));

      // 重新锁定
      await db.update(userTemplates)
        .set({ auditStatus: 'pending' })
        .where(eq(userTemplates.id, input.userTemplateId));

      return { ok: true };
    }),

  // 发布已审核通过的模板（上架）
  publishApprovedTemplate: protectedProcedure
    .input(z.object({ userTemplateId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [ut] = await db.select()
        .from(userTemplates)
        .where(and(
          eq(userTemplates.id, input.userTemplateId),
          eq(userTemplates.userId, ctx.userId),
        ));
      if (!ut || !ut.templateId) throw new TRPCError({ code: 'NOT_FOUND', message: '模板不存在' });

      const [t] = await db.select().from(templates).where(eq(templates.id, ut.templateId));
      if (!t || t.auditStatus !== 'approved') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '模板未通过审核' });
      }

      await db.update(templates)
        .set({ isPublished: true })
        .where(eq(templates.id, ut.templateId));

      await db.update(userTemplates)
        .set({ auditStatus: null }) // 审核完成，解锁
        .where(eq(userTemplates.id, input.userTemplateId));

      return { ok: true };
    }),

  // ===== 管理员审核 =====

  adminListSubmissions: adminProcedure.query(async () => {
    // 返回所有用户上传的模板（含待审核/已通过/已拒绝），排除已删除的
    const items = await db.select({
      id: templates.id,
      title: templates.title,
      description: templates.description,
      source: templates.source,
      category: templates.category,
      aiTargetRole: templates.aiTargetRole,
      content: templates.content,
      price: templates.price,
      auditStatus: templates.auditStatus,
      reviewReason: templates.reviewReason,
      createdAt: templates.createdAt,
      uploaderId: templates.uploaderId,
    })
      .from(templates)
      .where(and(
        eq(templates.source, 'user'),
        sql`${templates.deletedAt} IS NULL`,
      ))
      .orderBy(desc(templates.createdAt));

    // 获取上传者信息
    const uploaderIds = [...new Set(items.map(i => i.uploaderId).filter(Boolean))] as string[];
    let uploaderInfo: { id: string; nickname: string | null; displayId: string | null; avatarUrl: string | null }[] = [];
    if (uploaderIds.length > 0) {
      uploaderInfo = await db.select({
        id: users.id,
        nickname: users.nickname,
        displayId: users.displayId,
        avatarUrl: users.avatarUrl,
      }).from(users).where(inArray(users.id, uploaderIds));
    }
    const userMap = new Map(uploaderInfo.map(u => [u.id, u]));

    return items.map(item => ({
      ...item,
      uploader: item.uploaderId ? userMap.get(item.uploaderId) : null,
    }));
  }),

  adminReviewTemplate: adminProcedure
    .input(z.object({
      templateId: z.string().uuid(),
      approved: z.boolean(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [template] = await db.select()
        .from(templates)
        .where(eq(templates.id, input.templateId));
      if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: '模板不存在' });

      if (input.approved) {
        await db.update(templates)
          .set({
            auditStatus: 'approved',
            reviewReason: null,
          })
          .where(eq(templates.id, input.templateId));
      } else {
        await db.update(templates)
          .set({
            auditStatus: 'rejected',
            reviewReason: input.reason || null,
          })
          .where(eq(templates.id, input.templateId));
      }

      // 同步更新用户模板审核状态
      const [ut] = await db.select()
        .from(userTemplates)
        .where(eq(userTemplates.templateId, input.templateId));
      if (ut) {
        await db.update(userTemplates)
          .set({
            auditStatus: input.approved ? 'locked' : null, // approved=locked(等待用户发布), rejected=解锁
          })
          .where(eq(userTemplates.id, ut.id));
      }

      return { ok: true };
    }),

  // ===== 管理员 — 官方模板管理 =====

  // 列出所有官方模板
  adminListOfficial: adminProcedure.query(async () => {
    return db.select()
      .from(templates)
      .where(eq(templates.source, 'official'))
      .orderBy(desc(templates.createdAt));
  }),

  // 创建官方模板
  adminCreateOfficial: adminProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.string().optional(),
      aiTargetRole: z.string().optional(),
      content: z.string().min(1),
      price: z.number().min(0).default(0),
    }))
    .mutation(async ({ input }) => {
      const [template] = await db.insert(templates).values({
        title: input.title,
        description: input.description,
        category: input.category,
        aiTargetRole: input.aiTargetRole || null,
        content: input.content,
        price: input.price,
        source: 'official',
        auditStatus: 'approved',
        isPublished: true,
      }).returning();
      return template;
    }),

  // 更新官方模板
  adminUpdateOfficial: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      aiTargetRole: z.string().optional(),
      content: z.string().optional(),
      price: z.number().optional(),
      isPublished: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const [template] = await db.update(templates)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(templates.id, id), eq(templates.source, 'official')))
        .returning();
      if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: '模板不存在' });
      return template;
    }),

  // 删除官方模板（软删除：设置 auditStatus='rejected'）
  adminDeleteOfficial: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db.update(templates)
        .set({ auditStatus: 'rejected', isPublished: false, updatedAt: new Date() })
        .where(and(eq(templates.id, input.id), eq(templates.source, 'official')));
      return { ok: true };
    }),

  // 切换官方模板发布状态
  adminTogglePublish: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const [template] = await db.select()
        .from(templates)
        .where(and(eq(templates.id, input.id), eq(templates.source, 'official')));
      if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: '模板不存在' });

      const newPublished = !template.isPublished;
      await db.update(templates)
        .set({ isPublished: newPublished, updatedAt: new Date() })
        .where(eq(templates.id, input.id));
      return { ok: true, isPublished: newPublished };
    }),

  // 修改用户模板（管理员权限）
  adminUpdateUserTemplate: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      aiTargetRole: z.string().optional(),
      content: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [template] = await db.select()
        .from(templates)
        .where(and(eq(templates.id, input.id), eq(templates.source, 'user')));
      if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: '用户模板不存在' });

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      if (input.category !== undefined) updates.category = input.category;
      if (input.aiTargetRole !== undefined) updates.aiTargetRole = input.aiTargetRole || null;
      if (input.content !== undefined) updates.content = input.content;

      await db.update(templates).set(updates).where(eq(templates.id, input.id));
      return { ok: true };
    }),

  // 删除用户模板（管理员权限，软删除）
  adminDeleteUserTemplate: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const [template] = await db.select()
        .from(templates)
        .where(and(eq(templates.id, input.id), eq(templates.source, 'user')));
      if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: '用户模板不存在' });

      // 同时软删除关联的用户模板
      await db.update(userTemplates)
        .set({ deletedAt: new Date() })
        .where(eq(userTemplates.templateId, input.id));

      // 将模板标记为已拒绝（使其不再显示在商城）
      await db.update(templates)
        .set({ auditStatus: 'rejected', isPublished: false, updatedAt: new Date() })
        .where(eq(templates.id, input.id));
      return { ok: true };
    }),

  // 获取已删除的用户模板（30天内，可恢复）
  adminListDeletedUserTemplates: adminProcedure.query(async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const items = await db.select({
      id: templates.id,
      title: templates.title,
      description: templates.description,
      source: templates.source,
      category: templates.category,
      aiTargetRole: templates.aiTargetRole,
      content: templates.content,
      price: templates.price,
      auditStatus: templates.auditStatus,
      reviewReason: templates.reviewReason,
      createdAt: templates.createdAt,
      uploaderId: templates.uploaderId,
      deletedAt: templates.deletedAt,
    })
      .from(templates)
      .where(and(
        eq(templates.source, 'user'),
        sql`${templates.deletedAt} IS NOT NULL`,
        sql`${templates.deletedAt} > ${thirtyDaysAgo}`,
      ))
      .orderBy(desc(templates.deletedAt));

    // 获取上传者信息
    const uploaderIds = [...new Set(items.map(i => i.uploaderId).filter(Boolean))] as string[];
    let uploaderInfo: { id: string; nickname: string | null; displayId: string | null; avatarUrl: string | null }[] = [];
    if (uploaderIds.length > 0) {
      uploaderInfo = await db.select({
        id: users.id,
        nickname: users.nickname,
        displayId: users.displayId,
        avatarUrl: users.avatarUrl,
      }).from(users).where(inArray(users.id, uploaderIds));
    }
    const userMap = new Map(uploaderInfo.map(u => [u.id, u]));

    return items.map(item => ({
      ...item,
      uploader: item.uploaderId ? userMap.get(item.uploaderId) : null,
    }));
  }),

  // 恢复已删除的用户模板
  adminRestoreUserTemplate: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [updated] = await db.update(templates)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(and(
          eq(templates.id, input.id),
          eq(templates.source, 'user'),
          sql`${templates.deletedAt} IS NOT NULL`,
          sql`${templates.deletedAt} > ${thirtyDaysAgo}`,
        ))
        .returning();

      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: '模板不存在或已超过30天' });

      // 同时恢复关联的用户模板
      await db.update(userTemplates)
        .set({ deletedAt: null })
        .where(eq(userTemplates.templateId, input.id));

      return { ok: true };
    }),

  // ===== 免责声明 =====

  // 获取当前生效的免责声明
  getActiveDisclaimer: publicProcedure.query(async () => {
    const [disclaimer] = await db.select()
      .from(disclaimers)
      .where(eq(disclaimers.isActive, true))
      .limit(1);
    if (!disclaimer) throw new TRPCError({ code: 'NOT_FOUND', message: '免责声明不存在' });
    return { title: disclaimer.title, content: disclaimer.content, version: disclaimer.version };
  }),

  // 管理员更新免责声明
  adminUpdateDisclaimer: adminProcedure
    .input(z.object({
      title: z.string().min(1),
      content: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      // 将旧版标记失效
      await db.update(disclaimers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(disclaimers.isActive, true));

      // 获取最新版本号
      const [latest] = await db.select({ version: disclaimers.version })
        .from(disclaimers)
        .orderBy(desc(disclaimers.version))
        .limit(1);
      const newVersion = (latest?.version ?? 0) + 1;

      // 插入新版本
      const [newDisclaimer] = await db.insert(disclaimers).values({
        title: input.title,
        content: input.content,
        version: newVersion,
        isActive: true,
      }).returning();

      return { ok: true, version: newDisclaimer.version };
    }),

  // 获取免责声明历史版本（管理员）
  getDisclaimerHistory: adminProcedure.query(async () => {
    return db.select({
      version: disclaimers.version,
      title: disclaimers.title,
      content: disclaimers.content,
      isActive: disclaimers.isActive,
      updatedAt: disclaimers.updatedAt,
    })
      .from(disclaimers)
      .orderBy(desc(disclaimers.version));
  }),

  // ===== 收益/账单 =====

  // 获取用户模板收益
  getEarnings: protectedProcedure.query(async ({ ctx }) => {
    // 查询购买记录中属于用户上传的模板
    const userTemplatesList = await db.select({ id: templates.id, title: templates.title, price: templates.price })
      .from(templates)
      .where(eq(templates.uploaderId, ctx.userId));

    if (userTemplatesList.length === 0) {
      return { totalEarnings: 0, templateEarnings: [] };
    }

    const templateIds = userTemplatesList.map(t => t.id);
    const purchases = await db.select()
      .from(templatePurchases)
      .where(sql`${templatePurchases.templateId} = ANY(${templateIds})`)
      .orderBy(desc(templatePurchases.createdAt));

    const templateEarnings = userTemplatesList.map(t => {
      const templatePurchases = purchases.filter(p => p.templateId === t.id);
      const totalAmount = templatePurchases.reduce((sum, p) => sum + (p.pricePaid ?? 0), 0);
      return {
        templateId: t.id,
        title: t.title,
        price: t.price,
        salesCount: templatePurchases.length,
        totalAmount,
      };
    });

    const totalEarnings = templateEarnings.reduce((sum, t) => sum + t.totalAmount, 0);

    return { totalEarnings, templateEarnings };
  }),

  // ===== 用户已购买 / 已点赞 =====

  // 获取已购买模板列表
  myPurchases: protectedProcedure.query(async ({ ctx }) => {
    const purchases = await db.select({
      template: {
        id: templates.id,
        title: templates.title,
        description: templates.description,
        source: templates.source,
        category: templates.category,
        price: templates.price,
        viewCount: templates.viewCount,
        importCount: templates.importCount,
        likesCount: templates.likesCount,
        createdAt: templates.createdAt,
      },
      purchasePrice: templatePurchases.pricePaid,
      purchasedAt: templatePurchases.createdAt,
    })
      .from(templatePurchases)
      .innerJoin(templates, eq(templatePurchases.templateId, templates.id))
      .where(eq(templatePurchases.userId, ctx.userId))
      .orderBy(desc(templatePurchases.createdAt));
    return purchases;
  }),

  // 获取已点赞模板列表
  myLikes: protectedProcedure.query(async ({ ctx }) => {
    const likes = await db.select({
      template: {
        id: templates.id,
        title: templates.title,
        description: templates.description,
        source: templates.source,
        category: templates.category,
        price: templates.price,
        viewCount: templates.viewCount,
        importCount: templates.importCount,
        likesCount: templates.likesCount,
        createdAt: templates.createdAt,
      },
      ratedAt: templateLikes.createdAt,
    })
      .from(templateLikes)
      .innerJoin(templates, eq(templateLikes.templateId, templates.id))
      .where(eq(templateLikes.userId, ctx.userId))
      .orderBy(desc(templateLikes.createdAt));
    return likes;
  }),

  // 内容指纹检测 — 检查用户输入文本是否匹配付费模板
  checkFingerprint: protectedProcedure
    .input(z.object({ text: z.string() }))
    .mutation(async ({ input }) => {
      if (!input.text || input.text.length < 200) return { matched: false };
      const { checkContentFingerprint } = await import('./content-fingerprint');
      return checkContentFingerprint(input.text);
    }),

});

// 辅助函数：检查用户是否已购买模板
async function isTemplatePurchased(userId: string, templateId: string): Promise<boolean> {
  const [purchase] = await db.select()
    .from(templatePurchases)
    .where(and(
      eq(templatePurchases.templateId, templateId),
      eq(templatePurchases.userId, userId),
    ));
  return !!purchase;
}

async function isTemplateLiked(userId: string, templateId: string): Promise<boolean> {
  const [like] = await db.select()
    .from(templateLikes)
    .where(and(
      eq(templateLikes.templateId, templateId),
      eq(templateLikes.userId, userId),
    ));
  return !!like;
}
