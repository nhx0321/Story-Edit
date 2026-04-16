// AI 对话路由
import { z } from 'zod';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, verifyProjectOwner } from '../../trpc';
import { db } from '../../db';
import { conversations, conversationMessages, volumes, units, chapters, chapterVersions, settings, aiRoles } from '../../db/schema';
import { resolveConversationRole, getWelcomeMessage } from '../creation-engine/role-dispatcher';
import { DEFAULT_PROMPTS } from '../creation-engine/role-dispatcher';
import { getFeatureLimits, checkSubscription } from '../subscription/gate';

export const conversationRouter = router({
  create: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      type: z.enum(['outline', 'settings', 'chapter']),
      title: z.string(),
      targetEntityId: z.string().uuid().optional(),
      targetEntityType: z.string().optional(),
      roleKey: z.string().default('editor'),
      workflowStepId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [conv] = await db.insert(conversations).values(input).returning();
      // 插入系统消息
      const systemPrompt = resolveConversationRole(input.roleKey);
      await db.insert(conversationMessages).values({
        conversationId: conv!.id, role: 'system', content: systemPrompt, sortOrder: 0,
      });
      // 生成欢迎消息
      const welcomeMessage = getWelcomeMessage(input.roleKey);
      return { ...conv, welcomeMessage };
    }),

  list: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), type: z.enum(['outline', 'settings', 'chapter']).optional() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const conditions = [eq(conversations.projectId, input.projectId)];
      if (input.type) conditions.push(eq(conversations.type, input.type));
      return db.select().from(conversations).where(and(...conditions)).orderBy(desc(conversations.updatedAt));
    }),

  get: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [conv] = await db.select().from(conversations).where(eq(conversations.id, input.conversationId));
      if (!conv) throw new TRPCError({ code: 'NOT_FOUND' });
      await verifyProjectOwner(conv.projectId, ctx.userId);
      const messages = await db.select().from(conversationMessages)
        .where(eq(conversationMessages.conversationId, input.conversationId))
        .orderBy(asc(conversationMessages.sortOrder));
      return { ...conv, messages };
    }),

  // 更新对话的目标实体（用于 writer 角色切换章节时更新上下文）
  updateTarget: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      targetEntityId: z.string().uuid().optional(),
      targetEntityType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [conv] = await db.select().from(conversations).where(eq(conversations.id, input.conversationId));
      if (!conv) throw new TRPCError({ code: 'NOT_FOUND' });
      await verifyProjectOwner(conv.projectId, ctx.userId);
      await db.update(conversations).set({
        targetEntityId: input.targetEntityId,
        targetEntityType: input.targetEntityType,
        updatedAt: new Date(),
      }).where(eq(conversations.id, input.conversationId));
      return { success: true };
    }),

  sendMessage: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      actionType: z.string().optional(),
      actionPayload: z.record(z.unknown()).optional(),
      tokenCount: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [conv] = await db.select().from(conversations).where(eq(conversations.id, input.conversationId));
      if (!conv) throw new TRPCError({ code: 'NOT_FOUND' });
      await verifyProjectOwner(conv.projectId, ctx.userId);
      const [latest] = await db.select({ sortOrder: conversationMessages.sortOrder })
        .from(conversationMessages).where(eq(conversationMessages.conversationId, input.conversationId))
        .orderBy(desc(conversationMessages.sortOrder)).limit(1);
      const nextOrder = (latest?.sortOrder ?? 0) + 1;
      const [msg] = await db.insert(conversationMessages).values({
        conversationId: input.conversationId, role: input.role, content: input.content,
        actionType: input.actionType, actionPayload: input.actionPayload,
        tokenCount: input.tokenCount ?? 0, sortOrder: nextOrder,
      }).returning();
      await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, input.conversationId));
      return msg;
    }),

  confirmAction: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      actionType: z.string(),
      payload: z.record(z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      const [conv] = await db.select().from(conversations).where(eq(conversations.id, input.conversationId));
      if (!conv) throw new TRPCError({ code: 'NOT_FOUND' });
      await verifyProjectOwner(conv.projectId, ctx.userId);
      const p = input.payload as Record<string, string>;

      // UUID 校验 helper — 如果传入的不是 UUID（如标题文本），尝试按名称查找
      const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      // 检测 AI 是否把模板占位符当真实值使用了（如 {{xxx}}、上一步...）
      const isPlaceholder = (v: string) => v && (v.includes('{{') || v.includes('上一步') || v.includes('请填') || v.includes('UUID'));

      // 从标题中提取序号（如 "单元一"→1, "第一章"→1, "第三卷"→3）
      const extractSortNum = (title: string): number | null => {
        const m = title.match(/[第]?([零一二三四五六七八九十百\d]+)[章节卷单元]/);
        if (!m) return null;
        const numMap: Record<string, number> = { 零:0, 一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10, 百:100 };
        const s = m[1]!;
        if (numMap[s] != null) return numMap[s];
        const n = parseInt(s);
        return isNaN(n) ? null : n;
      };

      // 查询卷的 sortOrder（用于计算全局编号）
      const getVolumeSortNum = async (volumeId: string): Promise<number> => {
        const [vol] = await db.select({ sortOrder: volumes.sortOrder }).from(volumes).where(eq(volumes.id, volumeId));
        return vol?.sortOrder ?? 1;
      };

      switch (input.actionType) {
        case 'create_volume': {
          // 从标题中提取序号作为 sortOrder
          const titleSortNum = extractSortNum(p.title || '');
          let sortOrder: number;
          if (titleSortNum != null) {
            sortOrder = titleSortNum;
          } else {
            const [maxVol] = await db.select({ maxSort: sql<number>`MAX(${volumes.sortOrder})` })
              .from(volumes).where(eq(volumes.projectId, conv.projectId));
            sortOrder = (maxVol?.maxSort ?? 0) + 1;
          }
          const [vol] = await db.insert(volumes).values({ projectId: conv.projectId, title: p.title || '新卷', synopsis: p.synopsis, sortOrder }).returning();
          // 更新对话上下文 — 当前工作卷
          await db.update(conversations).set({ targetEntityId: vol!.id, targetEntityType: 'volume' })
            .where(eq(conversations.id, input.conversationId));
          return { type: 'volume', entity: vol };
        }
        case 'create_unit': {
          // 优先级：1) 对话上下文中的卷  2) 显式 volumeId  3) 最近创建的卷
          let volumeId: string | undefined;

          if (conv.targetEntityId && conv.targetEntityType === 'volume') {
            // 使用对话上下文中的卷
            volumeId = conv.targetEntityId;
          } else if (p.volumeId && isUuid(p.volumeId) && !isPlaceholder(p.volumeId)) {
            volumeId = p.volumeId;
          } else if (p.volumeId && !isUuid(p.volumeId) && !isPlaceholder(p.volumeId)) {
            const [volByName] = await db.select({ id: volumes.id }).from(volumes)
              .where(and(eq(volumes.projectId, conv.projectId), eq(volumes.title, p.volumeId)));
            if (volByName) volumeId = volByName.id;
          }
          if (!volumeId) {
            const [latestVol] = await db.select({ id: volumes.id }).from(volumes)
              .where(eq(volumes.projectId, conv.projectId))
              .orderBy(asc(volumes.sortOrder)).limit(1);
            if (!latestVol) throw new TRPCError({ code: 'BAD_REQUEST', message: '请先创建卷，再创建单元' });
            volumeId = latestVol.id;
          }
          // 计算全局 sortOrder = 卷序号×100 + 单元序号
          const titleSortNum = extractSortNum(p.title || '');
          let sortOrder: number;
          const volSortNum = await getVolumeSortNum(volumeId);
          if (titleSortNum != null) {
            sortOrder = volSortNum * 100 + titleSortNum;
          } else {
            const [maxUnit] = await db.select({ maxSort: sql<number>`MAX(${units.sortOrder})` })
              .from(units).where(eq(units.volumeId, volumeId));
            // 同卷内递增，保持百位卷号
            sortOrder = volSortNum * 100 + ((maxUnit?.maxSort ?? 0) % 100 + 1);
          }
          const [unit] = await db.insert(units).values({ volumeId, title: p.title || '新单元', synopsis: p.synopsis, sortOrder }).returning();
          // 更新对话上下文 — 当前工作单元
          await db.update(conversations).set({ targetEntityId: unit!.id, targetEntityType: 'unit' })
            .where(eq(conversations.id, input.conversationId));
          return { type: 'unit', entity: unit };
        }
        case 'create_chapter': {
          // 优先级：1) 对话上下文中的单元  2) 显式 unitId  3) 最近创建的单元
          let unitId: string | undefined;

          if (conv.targetEntityId && conv.targetEntityType === 'unit') {
            // 使用对话上下文中的单元
            unitId = conv.targetEntityId;
          } else if (p.unitId && isUuid(p.unitId) && !isPlaceholder(p.unitId)) {
            unitId = p.unitId;
          } else if (p.unitId && !isUuid(p.unitId) && !isPlaceholder(p.unitId)) {
            const [unitByName] = await db.select({ id: units.id }).from(units)
              .innerJoin(volumes, eq(units.volumeId, volumes.id))
              .where(and(eq(volumes.projectId, conv.projectId), eq(units.title, p.unitId)));
            if (unitByName) unitId = unitByName.id;
          }
          if (!unitId) {
            const [latestUnit] = await db.select({ id: units.id }).from(units)
              .innerJoin(volumes, eq(units.volumeId, volumes.id))
              .where(eq(volumes.projectId, conv.projectId))
              .orderBy(asc(units.sortOrder)).limit(1);
            if (!latestUnit) {
              // 没有单元时自动创建默认单元
              let volumeId: string;
              const [latestVol] = await db.select({ id: volumes.id }).from(volumes)
                .where(eq(volumes.projectId, conv.projectId))
                .orderBy(asc(volumes.sortOrder)).limit(1);
              if (!latestVol) throw new TRPCError({ code: 'BAD_REQUEST', message: '请先创建卷或单元' });
              volumeId = latestVol.id;
              const [autoUnit] = await db.insert(units).values({ volumeId, title: '默认单元', synopsis: '', sortOrder: 1 }).returning();
              unitId = autoUnit!.id;
            } else {
              unitId = latestUnit.id;
            }
          }
          // 计算全局 sortOrder = 卷序号×10000 + 单元序号×100 + 章节序号
          const titleSortNum = extractSortNum(p.title || '');
          let sortOrder: number;
          const [unitInfo] = await db.select({ volumeId: units.volumeId, sortOrder: units.sortOrder }).from(units).where(eq(units.id, unitId));
          if (unitInfo) {
            const volSortNum = await getVolumeSortNum(unitInfo.volumeId);
            const unitSortNum = unitInfo.sortOrder % 100; // 从单元sortOrder中提取单元内序号
            if (titleSortNum != null) {
              sortOrder = volSortNum * 10000 + unitSortNum * 100 + titleSortNum;
            } else {
              const [maxCh] = await db.select({ maxSort: sql<number>`MAX(${chapters.sortOrder})` })
                .from(chapters).where(eq(chapters.unitId, unitId));
              sortOrder = volSortNum * 10000 + unitSortNum * 100 + ((maxCh?.maxSort ?? 0) % 100 + 1);
            }
          } else {
            const [maxCh] = await db.select({ maxSort: sql<number>`MAX(${chapters.sortOrder})` })
              .from(chapters).where(eq(chapters.unitId, unitId));
            sortOrder = (maxCh?.maxSort ?? 0) + 1;
          }
          const [ch] = await db.insert(chapters).values({ unitId, title: p.title || '新章节', synopsis: p.synopsis, sortOrder }).returning();
          return { type: 'chapter', entity: ch };
        }
        case 'create_setting': {
          const [s] = await db.insert(settings).values({ projectId: conv.projectId, category: p.category || '未分类', title: p.title || '新设定', content: p.content || '' }).returning();
          return { type: 'setting', entity: s };
        }
        case 'save_version': {
          const chapterId = p.chapterId || conv.targetEntityId;
          if (!chapterId) throw new TRPCError({ code: 'BAD_REQUEST', message: '缺少章节ID' });
          const [latest] = await db.select({ versionNumber: chapterVersions.versionNumber })
            .from(chapterVersions).where(eq(chapterVersions.chapterId, chapterId))
            .orderBy(desc(chapterVersions.versionNumber)).limit(1);
          const nextVersion = (latest?.versionNumber ?? 0) + 1;
          const content = p.content || '';
          const wordCount = content.replace(/\s/g, '').length;
          const [v] = await db.insert(chapterVersions).values({
            chapterId, content, versionNumber: nextVersion, wordCount, label: p.label || 'AI生成',
          }).returning();
          return { type: 'version', entity: v };
        }
        default:
          throw new TRPCError({ code: 'BAD_REQUEST', message: `未知操作类型: ${input.actionType}` });
      }
    }),

  delete: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [conv] = await db.select().from(conversations).where(eq(conversations.id, input.conversationId));
      if (!conv) throw new TRPCError({ code: 'NOT_FOUND' });
      await verifyProjectOwner(conv.projectId, ctx.userId);
      await db.delete(conversationMessages).where(eq(conversationMessages.conversationId, input.conversationId));
      await db.delete(conversations).where(eq(conversations.id, input.conversationId));
      return { success: true };
    }),

  // ========== Agent 提示词管理 ==========

  // 获取项目所有 Agent 提示词
  getAgentPrompts: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const AGENT_CONFIG = [
        { roleKey: 'editor', name: '文学编辑', description: '剧情构思、大纲创作、章节规划' },
        { roleKey: 'setting_editor', name: '设定编辑', description: '世界观搭建、设定体系设计、一致性校验' },
        { roleKey: 'writer', name: '小说作者', description: '章节正文撰写、场景描写、节奏控制' },
      ];

      const results = [];
      for (const agent of AGENT_CONFIG) {
        const [custom] = await db.select().from(aiRoles)
          .where(and(eq(aiRoles.projectId, input.projectId), eq(aiRoles.role, agent.roleKey)));
        const defaultPrompt = DEFAULT_PROMPTS[agent.roleKey] || '';
        results.push({
          roleKey: agent.roleKey,
          name: agent.name,
          description: agent.description,
          currentPrompt: custom?.systemPrompt || defaultPrompt,
          defaultPrompt,
          isCustomized: !!custom,
        });
      }

      return results;
    }),

  // 保存自定义提示词（付费用户限定）
  saveAgentPrompt: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      roleKey: z.enum(['editor', 'setting_editor', 'writer']),
      prompt: z.string().min(10),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      // 验证付费状态
      const subCtx = await checkSubscription(ctx.userId);
      const features = getFeatureLimits(subCtx.tier);
      if (!features.canCustomizePrompts) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '此功能需要付费会员，请升级订阅' });
      }

      const AGENT_NAMES: Record<string, string> = {
        editor: '文学编辑',
        setting_editor: '设定编辑',
        writer: '小说作者',
      };

      const existing = await db.select().from(aiRoles)
        .where(and(eq(aiRoles.projectId, input.projectId), eq(aiRoles.role, input.roleKey)));

      if (existing.length > 0) {
        await db.update(aiRoles)
          .set({ systemPrompt: input.prompt })
          .where(and(eq(aiRoles.projectId, input.projectId), eq(aiRoles.role, input.roleKey)));
      } else {
        await db.insert(aiRoles).values({
          projectId: input.projectId,
          name: AGENT_NAMES[input.roleKey] || input.roleKey,
          role: input.roleKey,
          systemPrompt: input.prompt,
          isDefault: false,
        });
      }

      return { success: true };
    }),

  // 一键恢复预设提示词
  resetAgentPrompt: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      roleKey: z.enum(['editor', 'setting_editor', 'writer']),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      await db.delete(aiRoles)
        .where(and(eq(aiRoles.projectId, input.projectId), eq(aiRoles.role, input.roleKey)));
      return { success: true, defaultPrompt: DEFAULT_PROMPTS[input.roleKey] || '' };
    }),

  // AI 引导提示词优化（付费用户限定）
  refineAgentPrompt: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      roleKey: z.enum(['editor', 'setting_editor', 'writer']),
      userPreferences: z.string(),
      currentPrompt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const subCtx = await checkSubscription(ctx.userId);
      const features = getFeatureLimits(subCtx.tier);
      if (!features.canCustomizePrompts) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '此功能需要付费会员，请升级订阅' });
      }

      const currentPrompt = input.currentPrompt || DEFAULT_PROMPTS[input.roleKey] || '';

      // 返回优化提示（由前端调用 AI stream 完成）
      return {
        systemMessage: `你是一名专业的 AI 提示词优化师。请根据以下用户偏好，优化对应 Agent 的系统提示词。

## Agent 角色
${input.roleKey}

## 当前提示词
${currentPrompt}

## 用户偏好/要求
${input.userPreferences}

## 要求
1. 保留当前提示词的核心结构和指导原则
2. 将用户的偏好融入提示词中，增强对应能力
3. 保持提示词的专业性和可操作性
4. 输出完整的优化后提示词，不要只输出修改部分
5. 只输出优化后的提示词正文，不要添加任何解释说明`,
        userMessage: `请根据以上信息，输出优化后的提示词。`,
      };
    }),
});
