// AI 对话路由
import { z } from 'zod';
import { eq, and, or, asc, desc, sql, isNull, ne } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, verifyProjectOwner } from '../../trpc';
import { db } from '../../db';
import { conversations, conversationMessages, volumes, units, chapters, chapterVersions, settings, aiRoles, storyNarratives, editLogs } from '../../db/schema';
import { resolveConversationRole, getWelcomeMessage } from '../creation-engine/role-dispatcher';
import { DEFAULT_PROMPTS } from '../creation-engine/role-dispatcher';

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
      modelId: z.string().optional(),
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

      // 从标题中提取序号（如 "单元一"→1, "第一章"→1, "第三卷"→3, "第十五卷"→15, "卷五"→5）
      const parseChineseNum = (s: string): number | null => {
        const numMap: Record<string, number> = { 零:0, 一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9 };
        // 纯阿拉伯数字
        if (/^\d+$/.test(s)) return parseInt(s);
        // 单个汉字
        if (numMap[s] != null) return numMap[s];
        if (s === '十') return 10;
        if (s === '百') return 100;
        // 复合数字（如 "十五"→15, "二十一"→21, "三十五"→35）
        if (s.length === 2) {
          const tens = numMap[s[0]];
          const ones = numMap[s[1]];
          if (tens != null && ones != null) return tens * 10 + ones;
          if (s[0] === '十' && ones != null) return 10 + ones; // 十三 → 13
        }
        if (s.length === 3) {
          const tens = numMap[s[0]];
          const ones = numMap[s[2]];
          if (s[1] === '十' && tens != null && ones != null) return tens * 10 + ones; // 三十五 → 35
        }
        return null;
      };

      const extractSortNum = (title: string, targetType?: 'unit' | 'chapter'): number | null => {
        // 对复合层级标题（如 "第一卷·单元一：xxx"），先尝试去掉卷号前缀再提取
        if (targetType === 'unit') {
          // 去掉 "第X卷" 前缀，从剩余部分提取单元序号
          const stripped = title.replace(/第[零一二三四五六七八九十百\d]+卷[·\.\-—\s]?/, '');
          // 模式1：[第]数字+单元/章（第一单元、第5章）
          let m = stripped.match(/[第]?([零一二三四五六七八九十百\d]+)[单元章]/);
          if (m) return parseChineseNum(m[1]!);
          // 模式2：单元/章+数字（单元1、章5）
          m = stripped.match(/[单元章]([零一二三四五六七八九十百\d]+)/);
          if (m) return parseChineseNum(m[1]!);
        }
        if (targetType === 'chapter') {
          const stripped = title.replace(/第[零一二三四五六七八九十百\d]+卷[·\.\-—\s]?/, '')
                                .replace(/第[零一二三四五六七八九十百\d]+单元[·\.\-—\s]?/, '');
          let m = stripped.match(/[第]?([零一二三四五六七八九十百\d]+)[章]/);
          if (m) return parseChineseNum(m[1]!);
          m = stripped.match(/[章]([零一二三四五六七八九十百\d]+)/);
          if (m) return parseChineseNum(m[1]!);
        }
        // 回退：原始逻辑
        let m = title.match(/[第]?([零一二三四五六七八九十百\d]+)[章节卷单元]/);
        if (m) return parseChineseNum(m[1]!);
        m = title.match(/[章节卷单元]([零一二三四五六七八九十百\d]+)/);
        if (m) return parseChineseNum(m[1]!);
        return null;
      };

      // 查询卷的 sortOrder（用于计算全局编号）
      const getVolumeSortNum = async (volumeId: string): Promise<number> => {
        const [vol] = await db.select({ sortOrder: volumes.sortOrder }).from(volumes).where(eq(volumes.id, volumeId));
        return vol?.sortOrder ?? 1;
      };

      switch (input.actionType) {
        case 'create_volume': {
          // 去重检查：同项目下是否已有同名且未删除的卷
          const [existingVol] = await db.select().from(volumes)
            .where(and(
              eq(volumes.projectId, conv.projectId),
              eq(volumes.title, p.title || '新卷'),
              or(isNull(volumes.status), ne(volumes.status, 'deleted'))
            ));
          if (existingVol) {
            // 已存在同名卷，直接返回并更新对话上下文
            await db.update(conversations).set({
              targetEntityId: existingVol.id,
              targetEntityType: 'volume',
              metadata: sql`COALESCE(${conversations.metadata}, '{}'::jsonb) || ${JSON.stringify({ currentVolumeId: existingVol.id, currentUnitId: null })}::jsonb`,
            }).where(eq(conversations.id, input.conversationId));
            return { type: 'volume', entity: existingVol };
          }
          // 从标题中提取序号作为 sortOrder
          const titleSortNum = extractSortNum(p.title || '');
          let sortOrder: number;
          if (titleSortNum != null) {
            sortOrder = titleSortNum;
          } else {
            const [maxVol] = await db.select({ maxSort: sql<number>`MAX(${volumes.sortOrder})` })
              .from(volumes).where(and(eq(volumes.projectId, conv.projectId), or(isNull(volumes.status), ne(volumes.status, 'deleted'))));
            sortOrder = (maxVol?.maxSort ?? 0) + 1;
          }
          const [vol] = await db.insert(volumes).values({ projectId: conv.projectId, title: p.title || '新卷', synopsis: p.synopsis, sortOrder }).returning();
          // 更新对话上下文 — 当前工作卷，同时清除之前的单元/章节上下文
          await db.update(conversations).set({
            targetEntityId: vol!.id,
            targetEntityType: 'volume',
            metadata: sql`COALESCE(${conversations.metadata}, '{}'::jsonb) || ${JSON.stringify({ currentVolumeId: vol!.id, currentUnitId: null })}::jsonb`,
          })
            .where(eq(conversations.id, input.conversationId));
          return { type: 'volume', entity: vol };
        }
        case 'create_unit': {

          const cp = p as Record<string, unknown>;

          // 优先级1：如果 AI 传了 volumeIndex，按排名匹配卷
          let volumeId: string | undefined;

          if (cp.volumeIndex != null) {
            const volIdx = typeof cp.volumeIndex === 'number' ? cp.volumeIndex : parseInt(String(cp.volumeIndex));
            if (!isNaN(volIdx) && volIdx > 0) {
              const allVols = await db.select({ id: volumes.id, sortOrder: volumes.sortOrder })
                .from(volumes)
                .where(and(
                  eq(volumes.projectId, conv.projectId),
                  or(isNull(volumes.status), ne(volumes.status, 'deleted'))
                ))
                .orderBy(asc(volumes.sortOrder));
              const targetVol = allVols[volIdx - 1];
              if (targetVol) {
                volumeId = targetVol.id;

              }
            }
          }

          // 优先级1.5：从标题中提取卷号（如 "第一卷·单元一：xxx" → volumeIndex=1）
          if (!volumeId && p.title) {
            const volMatch = p.title.match(/第([零一二三四五六七八九十百\d]+)卷/);
            if (volMatch) {
              const volNum = parseChineseNum(volMatch[1]!);
              if (volNum != null && volNum > 0) {
                const allVols = await db.select({ id: volumes.id, title: volumes.title, sortOrder: volumes.sortOrder })
                  .from(volumes)
                  .where(and(
                    eq(volumes.projectId, conv.projectId),
                    or(isNull(volumes.status), ne(volumes.status, 'deleted'))
                  ))
                  .orderBy(asc(volumes.sortOrder));
                const targetVol = allVols[volNum - 1];
                if (targetVol) {
                  volumeId = targetVol.id;

                }
              }
            }
          }

          // 优先级2：AI 没传 volumeIndex 时，智能推断所属卷
          if (!volumeId) {


            // 获取该项目下所有卷（按 sortOrder 排序）
            const allVols = await db.select({ id: volumes.id, title: volumes.title, sortOrder: volumes.sortOrder })
              .from(volumes)
              .where(and(
                eq(volumes.projectId, conv.projectId),
                or(isNull(volumes.status), ne(volumes.status, 'deleted'))
              ))
              .orderBy(asc(volumes.sortOrder));

            if (allVols.length === 1) {
              // 只有1个卷，直接用
              volumeId = allVols[0]!.id;

            } else if (allVols.length > 1) {
              // 获取每个卷下的单元数
              const volUnitCounts: Record<string, number> = {};
              for (const vol of allVols) {
                const count = await db.select({ count: sql<number>`count(*)::int` })
                  .from(units)
                  .where(and(
                    eq(units.volumeId, vol.id),
                    or(isNull(units.status), ne(units.status, 'deleted'))
                  ));
                volUnitCounts[vol.id] = count[0]?.count ?? 0;
              }



              // 关键推断：如果当前对话已有单元，使用该单元所在的卷
              // 这解决了"第一卷已有单元但被误判为空卷"的问题
              if (conv.targetEntityId && conv.targetEntityType === 'unit') {
                const [existingUnit] = await db.select({ volumeId: units.volumeId })
                  .from(units).where(eq(units.id, conv.targetEntityId));
                if (existingUnit) {
                  // 验证该卷仍然存在
                  const [volCheck] = await db.select({ id: volumes.id, title: volumes.title })
                    .from(volumes).where(eq(volumes.id, existingUnit.volumeId));
                  if (volCheck) {
                    volumeId = existingUnit.volumeId;

                  }
                }
              }

              // 如果对话上下文没有单元，从最近用户消息中推断卷号
              if (!volumeId) {
                // 查询最近 5 条用户消息，寻找卷号关键词
                const recentMsgs = await db.select({ content: conversationMessages.content })
                  .from(conversationMessages)
                  .where(and(
                    eq(conversationMessages.conversationId, input.conversationId),
                    eq(conversationMessages.role, 'user')
                  ))
                  .orderBy(desc(conversationMessages.sortOrder))
                  .limit(5);

                for (const msg of recentMsgs) {
                  const volMatch = msg.content.match(/第([零一二三四五六七八九十百\d]+)卷/);
                  if (volMatch) {
                    const volNum = parseChineseNum(volMatch[1]!);
                    if (volNum != null && volNum > 0 && volNum <= allVols.length) {
                      volumeId = allVols[volNum - 1]!.id;

                      break;
                    }
                  }
                }
              }

              // 如果用户消息也没有卷号线索，取第一个没有单元的卷（首次规划场景）
              if (!volumeId) {
                const firstEmptyVol = allVols.find(v => volUnitCounts[v.id] === 0);
                if (firstEmptyVol) {
                  volumeId = firstEmptyVol.id;

                } else {
                  // 所有卷都有单元，取第一个卷（最常见的工作场景）
                  volumeId = allVols[0]!.id;

                }
              }
            }
          }

          // 优先级3：使用对话上下文中的卷（仅在以上方法都失败时）
          if (!volumeId && conv.targetEntityId && conv.targetEntityType === 'volume') {
            const [volCheck] = await db.select({ id: volumes.id }).from(volumes)
              .where(eq(volumes.id, conv.targetEntityId));
            if (volCheck) {
              volumeId = volCheck.id;

            }
          }

          // 优先级4：使用 metadata 中的 currentVolumeId
          if (!volumeId && (conv.metadata as Record<string, unknown> | undefined)?.currentVolumeId) {
            const metaVolId = (conv.metadata as Record<string, unknown>)?.currentVolumeId as string;
            if (isUuid(metaVolId)) {
              const [volCheck] = await db.select({ id: volumes.id }).from(volumes)
                .where(eq(volumes.id, metaVolId));
              if (volCheck) {
                volumeId = volCheck.id;

              }
            }
          }

          // 优先级5：取第一个卷
          if (!volumeId) {
            const [firstVol] = await db.select({ id: volumes.id }).from(volumes)
              .where(and(
                eq(volumes.projectId, conv.projectId),
                or(isNull(volumes.status), ne(volumes.status, 'deleted'))
              ))
              .orderBy(asc(volumes.sortOrder))
              .limit(1);
            if (firstVol) {
              volumeId = firstVol.id;

            }
          }

          if (!volumeId) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: '创建单元失败：请先创建卷' });
          }

          // 去重检查：同卷下是否已有同名且未删除的单元
          const [existingUnit] = await db.select().from(units)
            .where(and(
              eq(units.volumeId, volumeId),
              eq(units.title, p.title || '新单元'),
              or(isNull(units.status), ne(units.status, 'deleted'))
            ));
          if (existingUnit) {
            await db.update(conversations).set({
              targetEntityId: existingUnit.id,
              targetEntityType: 'unit',
              metadata: sql`COALESCE(${conversations.metadata}, '{}'::jsonb) || ${JSON.stringify({ currentVolumeId: volumeId, currentUnitId: existingUnit.id })}::jsonb`,
            }).where(eq(conversations.id, input.conversationId));
            return { type: 'unit', entity: existingUnit };
          }

          // 计算全局 sortOrder = 卷序号×100 + 单元序号
          const titleSortNum = extractSortNum(p.title || '', 'unit');
          let sortOrder: number;
          const volSortNum = await getVolumeSortNum(volumeId);
          if (titleSortNum != null) {
            sortOrder = volSortNum * 100 + titleSortNum;
          } else {
            const [maxUnit] = await db.select({ maxSort: sql<number>`MAX(${units.sortOrder})` })
              .from(units).where(and(eq(units.volumeId, volumeId), or(isNull(units.status), ne(units.status, 'deleted'))));
            sortOrder = volSortNum * 100 + ((maxUnit?.maxSort ?? 0) % 100 + 1);
          }
          const [unit] = await db.insert(units).values({ volumeId, title: p.title || '新单元', synopsis: p.synopsis, sortOrder }).returning();
          // 更新对话上下文 — 当前工作单元，同时保留所属卷 ID 供后续单元创建使用
          await db.update(conversations).set({
            targetEntityId: unit!.id,
            targetEntityType: 'unit',
            metadata: sql`COALESCE(${conversations.metadata}, '{}'::jsonb) || ${JSON.stringify({ currentVolumeId: volumeId, currentUnitId: unit!.id })}::jsonb`,
          })
            .where(eq(conversations.id, input.conversationId));
          return { type: 'unit', entity: unit };
        }
        case 'create_chapter': {
          // 按序号排名匹配卷和单元
          let unitId: string | undefined;
          let resolvedVolumeIndex: number | null = null;
          let resolvedUnitIndex: number | null = null;
          const cp = p as Record<string, unknown>;

          if (cp.volumeIndex != null && cp.unitIndex != null) {
            const volIdx = typeof cp.volumeIndex === 'number' ? cp.volumeIndex : parseInt(String(cp.volumeIndex));
            const unitIdx = typeof cp.unitIndex === 'number' ? cp.unitIndex : parseInt(String(cp.unitIndex));
            resolvedVolumeIndex = volIdx;
            resolvedUnitIndex = unitIdx;

            // 先按 volumeIndex 找到对应排名的卷
            if (!isNaN(volIdx) && volIdx > 0) {
              const allVols = await db.select({ id: volumes.id, sortOrder: volumes.sortOrder })
                .from(volumes)
                .where(and(
                  eq(volumes.projectId, conv.projectId),
                  or(isNull(volumes.status), ne(volumes.status, 'deleted'))
                ))
                .orderBy(asc(volumes.sortOrder));
              const targetVol = allVols[volIdx - 1];
              if (targetVol) {
                // 再按 unitIndex 在该卷下找到对应排名的单元
                const unitsInVol = await db.select({ id: units.id, title: units.title, sortOrder: units.sortOrder })
                  .from(units)
                  .where(and(
                    eq(units.volumeId, targetVol.id),
                    or(isNull(units.status), ne(units.status, 'deleted'))
                  ))
                  .orderBy(asc(units.sortOrder));
                const targetUnit = unitsInVol[unitIdx - 1];
                if (targetUnit) {
                  unitId = targetUnit.id;

                } else {

                  // 回退：按标题匹配
                  if (p.title) {
                    // 尝试去掉卷号前缀后匹配（如 "第一卷·单元一" → "单元一"）
                    const simplifiedTitle = p.title.replace(/^第[零一二三四五六七八九十百\d]+卷[·\.\-—]?/, '');
                    const [byTitle] = await db.select({ id: units.id }).from(units)
                      .where(and(eq(units.volumeId, targetVol.id), eq(units.title, simplifiedTitle)));
                    if (byTitle) {
                      unitId = byTitle.id;

                    }
                  }
                }
              }
            }
          }

          // 回退 1：使用对话上下文中的单元
          if (!unitId && conv.targetEntityId && conv.targetEntityType === 'unit') {
            const [unitCheck] = await db.select({ id: units.id }).from(units).where(eq(units.id, conv.targetEntityId));
            if (unitCheck) {
              unitId = unitCheck.id;

            }
          }

          // 回退 2：使用 metadata 中的 currentUnitId
          if (!unitId && (conv.metadata as Record<string, unknown> | undefined)?.currentUnitId) {
            const metaUnitId = conv.metadata!.currentUnitId as string;
            if (isUuid(metaUnitId)) {
              const [unitCheck] = await db.select({ id: units.id }).from(units).where(eq(units.id, metaUnitId));
              if (unitCheck) {
                unitId = unitCheck.id;

              }
            }
          }

          // 回退 3：取该卷下第一个单元
          if (!unitId && cp.volumeIndex != null) {
            const volIdx = typeof cp.volumeIndex === 'number' ? cp.volumeIndex : parseInt(String(cp.volumeIndex));
            if (!isNaN(volIdx) && volIdx > 0) {
              const allVols = await db.select({ id: volumes.id }).from(volumes)
                .where(and(eq(volumes.projectId, conv.projectId), or(isNull(volumes.status), ne(volumes.status, 'deleted'))))
                .orderBy(asc(volumes.sortOrder));
              const targetVol = allVols[volIdx - 1];
              if (targetVol) {
                const [firstUnit] = await db.select({ id: units.id }).from(units)
                  .where(and(eq(units.volumeId, targetVol.id), or(isNull(units.status), ne(units.status, 'deleted'))))
                  .orderBy(asc(units.sortOrder))
                  .limit(1);
                if (firstUnit) {
                  unitId = firstUnit.id;

                }
              }
            }
          }

          if (!unitId) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: '创建章节失败：请先创建单元' });
          }

          // 计算全局 sortOrder = 卷序号×10000 + 单元序号×100 + 章节序号
          const titleSortNum = extractSortNum(p.title || '', 'chapter');
          let sortOrder: number;
          const [unitInfo] = await db.select({ volumeId: units.volumeId, sortOrder: units.sortOrder }).from(units).where(eq(units.id, unitId));
          if (unitInfo) {
            const volSortNum = resolvedVolumeIndex ?? await getVolumeSortNum(unitInfo.volumeId);
            const unitSortNum = resolvedUnitIndex ?? (unitInfo.sortOrder % 100);
            if (titleSortNum != null) {
              sortOrder = volSortNum * 10000 + unitSortNum * 100 + titleSortNum;
            } else {
              const [maxCh] = await db.select({ maxSort: sql<number>`MAX(${chapters.sortOrder})` })
                .from(chapters).where(and(eq(chapters.unitId, unitId), or(isNull(chapters.status), ne(chapters.status, 'deleted'))));
              sortOrder = volSortNum * 10000 + unitSortNum * 100 + ((maxCh?.maxSort ?? 0) % 100 + 1);
            }
          } else {
            const [maxCh] = await db.select({ maxSort: sql<number>`MAX(${chapters.sortOrder})` })
              .from(chapters).where(and(eq(chapters.unitId, unitId), or(isNull(chapters.status), ne(chapters.status, 'deleted'))));
            sortOrder = (maxCh?.maxSort ?? 0) + 1;
          }
          const [ch] = await db.insert(chapters).values({ unitId, title: p.title || '新章节', synopsis: p.synopsis, sortOrder }).returning();
          // 同时保存单元ID和卷ID到metadata，供后续章节创建使用
          const [unitForMeta] = await db.select({ volumeId: units.volumeId }).from(units).where(eq(units.id, unitId));
          await db.update(conversations).set({
            targetEntityId: ch!.id,
            targetEntityType: 'chapter',
            metadata: sql`COALESCE(${conversations.metadata}, '{}'::jsonb) || ${JSON.stringify({ currentUnitId: unitId, currentVolumeId: unitForMeta?.volumeId })}::jsonb`,
          })
            .where(eq(conversations.id, input.conversationId));
          return { type: 'chapter', entity: ch };
        }
        case 'create_setting': {
          const [s] = await db.insert(settings).values({ projectId: conv.projectId, category: p.category || '未分类', title: p.title || '新设定', content: p.content || '' }).returning();
          return { type: 'setting', entity: s };
        }

        // ===== 覆盖更新（AI 讨论修改后确认导入） =====
        case 'update_volume': {
          const volId = p.id as string;
          if (!volId || !isUuid(volId)) throw new TRPCError({ code: 'BAD_REQUEST', message: '缺少卷ID' });
          // 读取旧值用于记录
          const [oldVol] = await db.select().from(volumes).where(eq(volumes.id, volId));
          const updates: Record<string, unknown> = {};
          if (p.title) updates.title = p.title;
          if (p.synopsis !== undefined) updates.synopsis = p.synopsis;
          if (p.sortOrder !== undefined) updates.sortOrder = p.sortOrder;
          if (Object.keys(updates).length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: '没有要更新的字段' });
          await db.update(volumes).set(updates).where(eq(volumes.id, volId));
          const [vol] = await db.select().from(volumes).where(eq(volumes.id, volId));
          // 记录修改日志
          if (p.title && oldVol?.title !== p.title) {
            await db.insert(editLogs).values({ projectId: conv.projectId, entityType: 'volume', entityId: volId, fieldName: 'title', oldValue: oldVol.title, newValue: p.title as string, aiRole: conv.roleKey });
          }
          if (p.synopsis !== undefined && oldVol?.synopsis !== p.synopsis) {
            await db.insert(editLogs).values({ projectId: conv.projectId, entityType: 'volume', entityId: volId, fieldName: 'synopsis', oldValue: oldVol.synopsis, newValue: p.synopsis as string, aiRole: conv.roleKey });
          }
          return { type: 'volume', entity: vol };
        }
        case 'update_unit': {
          // 从标题中提取序号，作为排序匹配
          const titleSortNum = p.title ? extractSortNum(p.title, 'unit') : null;

          let unitId = (p.id && isUuid(p.id as string)) ? p.id as string : undefined;

          // 如果没有提供 UUID，尝试按标题+所属卷匹配
          if (!unitId && p.title) {
            // 从对话上下文获取当前卷 ID（刚创建的单元所在的卷）
            let currentVolumeId: string | undefined;
            if (conv.targetEntityType === 'unit' && conv.targetEntityId) {
              const [unitCheck] = await db.select({ volumeId: units.volumeId }).from(units)
                .where(eq(units.id, conv.targetEntityId));
              if (unitCheck) currentVolumeId = unitCheck.volumeId;
            }
            // 仅在对话上下文没有 unit 时才使用 metadata
            if (!currentVolumeId && conv.metadata && (conv.metadata as Record<string, unknown>)?.currentVolumeId) {
              currentVolumeId = (conv.metadata as Record<string, unknown>)?.currentVolumeId as string;
            }

            if (currentVolumeId) {
              // 按标题精确匹配（排除已删除）
              const [byTitle] = await db.select({ id: units.id }).from(units)
                .where(and(eq(units.volumeId, currentVolumeId), eq(units.title, p.title), or(isNull(units.status), ne(units.status, 'deleted'))));
              if (byTitle) unitId = byTitle.id;
              else if (titleSortNum != null) {
                // 按排序序号匹配（如 "单元一"→第1个单元）
                const unitsInVol = await db.select({ id: units.id }).from(units)
                  .where(and(eq(units.volumeId, currentVolumeId), or(isNull(units.status), ne(units.status, 'deleted'))))
                  .orderBy(asc(units.sortOrder));
                const target = unitsInVol[titleSortNum - 1];
                if (target) unitId = target.id;
              }
            }
          }

          if (!unitId) throw new TRPCError({ code: 'BAD_REQUEST', message: '缺少单元ID' });
          const [oldUnit] = await db.select().from(units).where(eq(units.id, unitId));
          const updates: Record<string, unknown> = {};
          if (p.title) updates.title = p.title;
          if (p.synopsis !== undefined) updates.synopsis = p.synopsis;
          if (Object.keys(updates).length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: '没有要更新的字段' });
          await db.update(units).set(updates).where(eq(units.id, unitId));
          const [unit] = await db.select().from(units).where(eq(units.id, unitId));
          if (p.title && oldUnit?.title !== p.title) {
            await db.insert(editLogs).values({ projectId: conv.projectId, entityType: 'unit', entityId: unitId, fieldName: 'title', oldValue: oldUnit.title, newValue: p.title as string, aiRole: conv.roleKey });
          }
          if (p.synopsis !== undefined && oldUnit?.synopsis !== p.synopsis) {
            await db.insert(editLogs).values({ projectId: conv.projectId, entityType: 'unit', entityId: unitId, fieldName: 'synopsis', oldValue: oldUnit.synopsis, newValue: p.synopsis as string, aiRole: conv.roleKey });
          }
          return { type: 'unit', entity: unit };
        }
        case 'update_chapter': {
          const titleSortNum = p.title ? extractSortNum(p.title, 'chapter') : null;

          let chapterId = (p.id && isUuid(p.id as string)) ? p.id as string : undefined;

          // 如果没有提供 UUID，尝试按标题+所属单元匹配
          if (!chapterId && p.title) {
            let currentUnitId: string | undefined;
            if (conv.targetEntityType === 'chapter' && conv.targetEntityId) {
              const [chCheck] = await db.select({ unitId: chapters.unitId }).from(chapters)
                .where(eq(chapters.id, conv.targetEntityId));
              if (chCheck) currentUnitId = chCheck.unitId;
            }
            if (conv.metadata && (conv.metadata as Record<string, unknown>)?.currentUnitId) {
              currentUnitId = (conv.metadata as Record<string, unknown>)?.currentUnitId as string;
            }

            if (currentUnitId) {
              // 按标题精确匹配（排除已删除）
              const [byTitle] = await db.select({ id: chapters.id }).from(chapters)
                .where(and(eq(chapters.unitId, currentUnitId), eq(chapters.title, p.title), or(isNull(chapters.status), ne(chapters.status, 'deleted'))));
              if (byTitle) chapterId = byTitle.id;
              else if (titleSortNum != null) {
                // 按排序序号匹配
                const chsInUnit = await db.select({ id: chapters.id }).from(chapters)
                  .where(and(eq(chapters.unitId, currentUnitId), or(isNull(chapters.status), ne(chapters.status, 'deleted'))))
                  .orderBy(asc(chapters.sortOrder));
                const target = chsInUnit[titleSortNum - 1];
                if (target) chapterId = target.id;
              }
            }
          }

          if (!chapterId) throw new TRPCError({ code: 'BAD_REQUEST', message: '缺少章节ID' });
          const [oldChapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId));
          const updates: Record<string, unknown> = {};
          if (p.title) updates.title = p.title;
          if (p.synopsis !== undefined) updates.synopsis = p.synopsis;
          if (Object.keys(updates).length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: '没有要更新的字段' });
          await db.update(chapters).set(updates).where(eq(chapters.id, chapterId));
          const [ch] = await db.select().from(chapters).where(eq(chapters.id, chapterId));
          if (p.title && oldChapter?.title !== p.title) {
            await db.insert(editLogs).values({ projectId: conv.projectId, entityType: 'chapter', entityId: chapterId, fieldName: 'title', oldValue: oldChapter.title, newValue: p.title as string, aiRole: conv.roleKey });
          }
          if (p.synopsis !== undefined && oldChapter?.synopsis !== p.synopsis) {
            await db.insert(editLogs).values({ projectId: conv.projectId, entityType: 'chapter', entityId: chapterId, fieldName: 'synopsis', oldValue: oldChapter.synopsis, newValue: p.synopsis as string, aiRole: conv.roleKey });
          }
          return { type: 'chapter', entity: ch };
        }
        case 'update_setting': {
          const settingId = p.id as string;
          if (!settingId || !isUuid(settingId)) throw new TRPCError({ code: 'BAD_REQUEST', message: '缺少设定ID' });
          const [oldSetting] = await db.select().from(settings).where(eq(settings.id, settingId));
          const updates: Record<string, unknown> = {};
          if (p.title) updates.title = p.title;
          if (p.content !== undefined) updates.content = p.content;
          if (p.category) updates.category = p.category;
          if (Object.keys(updates).length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: '没有要更新的字段' });
          await db.update(settings).set({ ...updates, updatedAt: new Date() }).where(eq(settings.id, settingId));
          const [s] = await db.select().from(settings).where(eq(settings.id, settingId));
          if (p.title && oldSetting?.title !== p.title) {
            await db.insert(editLogs).values({ projectId: conv.projectId, entityType: 'setting', entityId: settingId, fieldName: 'title', oldValue: oldSetting.title, newValue: p.title as string, aiRole: conv.roleKey });
          }
          if (p.content !== undefined && oldSetting?.content !== p.content) {
            await db.insert(editLogs).values({ projectId: conv.projectId, entityType: 'setting', entityId: settingId, fieldName: 'content', oldValue: oldSetting.content, newValue: p.content as string, aiRole: conv.roleKey });
          }
          if (p.category && oldSetting?.category !== p.category) {
            await db.insert(editLogs).values({ projectId: conv.projectId, entityType: 'setting', entityId: settingId, fieldName: 'category', oldValue: oldSetting.category, newValue: p.category as string, aiRole: conv.roleKey });
          }
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

        // 设定交付（设定编辑完成全部设定后，交付给文学编辑）
        case 'deliver_settings': {
          const summary = p.summary || '';
          // 将设定交付摘要保存到对话 metadata，供文学编辑读取
          await db.update(conversations).set({
            metadata: sql`COALESCE(${conversations.metadata}, '{}'::jsonb) || ${JSON.stringify({ settingsDeliverySummary: summary, settingsDeliveredAt: new Date().toISOString() })}::jsonb`,
          }).where(eq(conversations.id, input.conversationId));
          return { type: 'deliver_settings', entity: { summary, projectId: conv.projectId } };
        }

        // 创建故事脉络
        case 'create_narrative': {
          // 先归档已有活跃脉络
          await db.update(storyNarratives).set({ status: 'archived', updatedAt: new Date() })
            .where(and(eq(storyNarratives.projectId, conv.projectId), eq(storyNarratives.status, 'active')));
          const [n] = await db.insert(storyNarratives).values({
            projectId: conv.projectId,
            title: p.title || '全书故事脉络',
            content: p.content || '',
            status: 'active',
          }).returning();
          return { type: 'narrative', entity: n };
        }

        // 更新故事脉络
        case 'update_narrative': {
          const narrativeId = p.id as string;
          if (!narrativeId || !isUuid(narrativeId)) throw new TRPCError({ code: 'BAD_REQUEST', message: '缺少脉络ID' });
          const updates: Record<string, unknown> = {};
          if (p.title) updates.title = p.title;
          if (p.content !== undefined) updates.content = p.content;
          if (Object.keys(updates).length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: '没有要更新的字段' });
          await db.update(storyNarratives).set({ ...updates, updatedAt: new Date() })
            .where(and(eq(storyNarratives.id, narrativeId), eq(storyNarratives.projectId, conv.projectId)));
          const [n] = await db.select().from(storyNarratives).where(eq(storyNarratives.id, narrativeId));
          return { type: 'narrative', entity: n };
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
        { roleKey: 'writer', name: '正文作者', description: '章节正文撰写、场景描写、节奏控制' },
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

      const AGENT_NAMES: Record<string, string> = {
        editor: '文学编辑',
        setting_editor: '设定编辑',
        writer: '正文作者',
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
