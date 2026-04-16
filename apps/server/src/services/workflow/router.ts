// 创作工作流 tRPC 路由
import { z } from 'zod';
import { eq, and, desc, asc, sql, isNull } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, verifyProjectOwner } from '../../trpc';
import { db } from '../../db';
import {
  volumes, units, chapters, chapterVersions,
  settings, memoryEntries, userTemplates,
} from '../../db/schema';

// 辅助：通过章节 → 单元 → 卷链验证项目归属
async function verifyChapterOwner(chapterId: string, userId: string) {
  const [ch] = await db.select({ unitId: chapters.unitId }).from(chapters).where(eq(chapters.id, chapterId));
  if (!ch) throw new TRPCError({ code: 'NOT_FOUND', message: '章节不存在' });
  const [unit] = await db.select({ volumeId: units.volumeId }).from(units).where(eq(units.id, ch.unitId));
  if (!unit) throw new TRPCError({ code: 'NOT_FOUND', message: '单元不存在' });
  const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, unit.volumeId));
  if (!vol) throw new TRPCError({ code: 'NOT_FOUND', message: '卷不存在' });
  await verifyProjectOwner(vol.projectId, userId);
  return vol.projectId;
}

// 辅助：通过单元 → 卷链验证项目归属
async function verifyUnitOwner(unitId: string, userId: string) {
  const [unit] = await db.select({ volumeId: units.volumeId }).from(units).where(eq(units.id, unitId));
  if (!unit) throw new TRPCError({ code: 'NOT_FOUND', message: '单元不存在' });
  const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, unit.volumeId));
  if (!vol) throw new TRPCError({ code: 'NOT_FOUND', message: '卷不存在' });
  await verifyProjectOwner(vol.projectId, userId);
  return vol.projectId;
}

export const workflowRouter = router({
  // ===== 大纲阶段 =====

  // 保存大纲内容（卷/单元/章节梗概）
  saveOutline: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      volumes: z.array(z.object({
        title: z.string(),
        synopsis: z.string().optional(),
        sortOrder: z.number().default(0),
        units: z.array(z.object({
          title: z.string(),
          synopsis: z.string().optional(),
          sortOrder: z.number().default(0),
          chapters: z.array(z.object({
            title: z.string(),
            synopsis: z.string().optional(),
            sortOrder: z.number().default(0),
          })),
        })),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const created = [];

      for (const volData of input.volumes) {
        // 创建或查找卷
        let vol = (await db.select().from(volumes)
          .where(and(eq(volumes.projectId, input.projectId), eq(volumes.title, volData.title)))
        )[0];

        if (!vol) {
          [vol] = await db.insert(volumes).values({
            projectId: input.projectId,
            title: volData.title,
            synopsis: volData.synopsis || null,
            sortOrder: volData.sortOrder,
          }).returning();
        } else {
          await db.update(volumes)
            .set({ synopsis: volData.synopsis || vol.synopsis })
            .where(eq(volumes.id, vol.id));
        }

        for (const unitData of volData.units) {
          let unit = (await db.select().from(units)
            .where(and(eq(units.volumeId, vol.id), eq(units.title, unitData.title)))
          )[0];

          if (!unit) {
            [unit] = await db.insert(units).values({
              volumeId: vol.id,
              title: unitData.title,
              synopsis: unitData.synopsis || null,
              sortOrder: unitData.sortOrder,
            }).returning();
          } else {
            await db.update(units)
              .set({ synopsis: unitData.synopsis || unit.synopsis })
              .where(eq(units.id, unit.id));
          }

          for (const chData of unitData.chapters) {
            let ch = (await db.select().from(chapters)
              .where(and(eq(chapters.unitId, unit.id), eq(chapters.title, chData.title)))
            )[0];

            if (!ch) {
              [ch] = await db.insert(chapters).values({
                unitId: unit.id,
                title: chData.title,
                synopsis: chData.synopsis || null,
                sortOrder: chData.sortOrder,
                status: 'draft',
              }).returning();
            } else {
              await db.update(chapters)
                .set({ synopsis: chData.synopsis || ch.synopsis })
                .where(eq(chapters.id, ch.id));
            }

            created.push({ type: 'chapter', id: ch.id, title: ch.title });
          }
        }
      }

      return { ok: true, created };
    }),

  // 获取项目大纲完整结构
  getOutline: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const vols = await db.select()
        .from(volumes)
        .where(and(eq(volumes.projectId, input.projectId), isNull(volumes.deletedAt)))
        .orderBy(asc(volumes.sortOrder));

      const result = [];
      for (const vol of vols) {
        const unitList = await db.select()
          .from(units)
          .where(and(eq(units.volumeId, vol.id), isNull(units.deletedAt)))
          .orderBy(asc(units.sortOrder));

        const unitData = [];
        for (const unit of unitList) {
          const chList = await db.select({
            id: chapters.id,
            title: chapters.title,
            synopsis: chapters.synopsis,
            sortOrder: chapters.sortOrder,
            status: chapters.status,
          })
            .from(chapters)
            .where(and(eq(chapters.unitId, unit.id), isNull(chapters.deletedAt)))
            .orderBy(asc(chapters.sortOrder));

          unitData.push({ ...unit, chapters: chList });
        }

        result.push({ ...vol, units: unitData });
      }

      return result;
    }),

  // ===== 设定阶段 =====

  // 获取相关设定（用于正文创作时调用）
  getRelatedSettings: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), category: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const where = [eq(settings.projectId, input.projectId), isNull(settings.deletedAt)];
      if (input.category) where.push(eq(settings.category, input.category));

      return db.select()
        .from(settings)
        .where(and(...where))
        .orderBy(asc(settings.sortOrder), asc(settings.category), asc(settings.title));
    }),

  // ===== 正文创作阶段 =====

  // 生成任务书
  generateTaskBrief: protectedProcedure
    .input(z.object({ chapterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const projectId = await verifyChapterOwner(input.chapterId, ctx.userId);
      const [ch] = await db.select().from(chapters).where(eq(chapters.id, input.chapterId));
      if (!ch) throw new TRPCError({ code: 'NOT_FOUND', message: '章节不存在' });

      // 获取同单元的所有章节，按 sortOrder 排序
      const allChaptersInUnit = await db.select({
        id: chapters.id,
        title: chapters.title,
        synopsis: chapters.synopsis,
        sortOrder: chapters.sortOrder,
      })
        .from(chapters)
        .where(and(eq(chapters.unitId, ch.unitId), isNull(chapters.deletedAt)))
        .orderBy(asc(chapters.sortOrder));

      // 精确查找上一章和下一章
      const currentIdx = allChaptersInUnit.findIndex(c => c.id === ch.id);
      const prevChapter = currentIdx > 0 ? allChaptersInUnit[currentIdx - 1] : null;
      const nextChapter = currentIdx < allChaptersInUnit.length - 1 ? allChaptersInUnit[currentIdx + 1] : null;

      // 获取项目所有设定
      const relatedSettings = await db.select({
        category: settings.category,
        title: settings.title,
        content: settings.content,
      })
        .from(settings)
        .where(and(eq(settings.projectId, projectId), isNull(settings.deletedAt)))
        .limit(50);

      // 获取最新版本正文（用于生成自检提示）
      const [latestVersion] = await db.select()
        .from(chapterVersions)
        .where(eq(chapterVersions.chapterId, input.chapterId))
        .orderBy(desc(chapterVersions.versionNumber))
        .limit(1);

      // 设定检测：分析梗概关键词，对比已有设定
      const existingCategories = [...new Set(relatedSettings.map(s => s.category))];
      const settingKeywords: Record<string, string[]> = {
        '力量体系': ['力量', '修炼', '境界', '等级', '功法', '法术', '神通', '武技', '阵法', '炼丹', '炼器'],
        '世界观': ['世界', '大陆', '星球', '宇宙', '位面', '空间', '宗门', '门派', '帝国', '王朝', '国家'],
        '角色设定': ['角色', '人物', '主角', '女主', '男主', '反派', '导师', '师父', '徒弟'],
        '道具物品': ['道具', '法宝', '神器', '武器', '丹药', '灵石', '金币', '物资'],
        '势力组织': ['势力', '组织', '家族', '家族', '商会', '协会', '联盟', '教派'],
      };
      const allKeywords = Object.values(settingKeywords).flat();
      const synopsisText = (ch.synopsis || '') + ' ' + (prevChapter?.synopsis || '');
      const missingSettings: string[] = [];
      for (const [category, keywords] of Object.entries(settingKeywords)) {
        if (existingCategories.includes(category)) continue;
        const hasKeyword = keywords.some(kw => synopsisText.includes(kw));
        if (hasKeyword) missingSettings.push(category);
      }
      // 通用检测：梗概中是否提到了任何设定关键词但无对应设定
      const hasAnySettingKeyword = allKeywords.some(kw => synopsisText.includes(kw));
      if (existingCategories.length === 0 && hasAnySettingKeyword) {
        missingSettings.push('基础设定');
      }

      // 生成任务书
      const prevSynopsis = prevChapter
        ? `${prevChapter.title}：${prevChapter.synopsis || '（无梗概）'}`
        : '（本章为开篇第一章，无前情梗概）';
      const nextSynopsis = nextChapter
        ? `${nextChapter.title}：${nextChapter.synopsis || '（无梗概）'}`
        : '（下一章梗概尚未规划，请先在大纲页面补充下一章的梗概以确保衔接）';

      const settingSummary = relatedSettings.map(s => `[${s.category}] ${s.title}: ${s.content.slice(0, 200)}`).join('\n');

      const brief = `# 创作任务书

## 章节信息
- 标题：${ch.title}
- 梗概：${ch.synopsis || '待补充'}

## 前情回顾
${prevSynopsis}

## 后续章节
${nextSynopsis}

## 相关设定
${settingSummary || '暂无设定，可自由发挥'}

${missingSettings.length > 0 ? '## ⚠️ 设定提醒\n检测到剧情中涉及以下内容，但尚未创建相关设定：' + missingSettings.map(s => `- ${s}`).join('\n') + '\n建议先前往设定页面补充相关设定，再进行创作。\n' : ''}

## 创作要求
1. 紧扣章节梗概展开
2. 与前文保持连贯
3. 注意人物性格和世界观一致性
4. 适当埋设伏笔
5. 保持网文爽点节奏

请根据以上信息创作本章正文。`;

      // 生成自检提示词
      const checkPrompt = latestVersion ? `你是一名专业的文学编辑和质量审核员。请对以下章节正文进行全面的自检，找出需要修改的问题。

## 章节信息
- 标题：${ch.title}
- 梗概：${ch.synopsis || '无'}

## 相关设定
${settingSummary || '暂无设定'}

## 正文内容
${latestVersion.content.slice(0, 10000)}

---

请按以下格式输出自检报告：
1. 标题与梗概一致性
2. 人物一致性
3. 设定一致性
4. 伏笔与逻辑
5. 节奏与结构
6. 文字质量
7. 爽点与钩子
8. 总体评分与修改建议` : '';

      return {
        brief,
        chapter: ch,
        prevChapter,
        nextChapter,
        prevChapters: prevChapter ? [prevChapter] : [],
        settingCount: relatedSettings.length,
        checkPrompt,
        missingSettings,
      };
    }),

  // 保存章节正文
  saveChapterContent: protectedProcedure
    .input(z.object({
      chapterId: z.string().uuid(),
      content: z.string().min(1),
      versionLabel: z.string().optional(),
      isFinal: z.boolean().default(false),
      wordCount: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyChapterOwner(input.chapterId, ctx.userId);
      const wc = input.wordCount || input.content.replace(/\s/g, '').length;

      // 获取当前最大版本号
      const [lastVersion] = await db.select({
        maxVersion: sql<number>`MAX(${chapterVersions.versionNumber})`,
      })
        .from(chapterVersions)
        .where(eq(chapterVersions.chapterId, input.chapterId));

      const newVersion = (lastVersion?.maxVersion || 0) + 1;

      const [version] = await db.insert(chapterVersions).values({
        chapterId: input.chapterId,
        content: input.content,
        versionNumber: newVersion,
        label: input.versionLabel || (input.isFinal ? `定稿 v${newVersion}` : `草稿 v${newVersion}`),
        isFinal: input.isFinal,
        wordCount: wc,
        status: 'active',
        versionType: input.isFinal ? 'final' : 'draft',
      }).returning();

      // 更新章节状态
      await db.update(chapters)
        .set({
          status: input.isFinal ? 'final' : 'draft',
          updatedAt: new Date(),
        })
        .where(eq(chapters.id, input.chapterId));

      return { version, wordCount: wc };
    }),

  // 获取章节正文版本列表
  getChapterVersions: protectedProcedure
    .input(z.object({ chapterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyChapterOwner(input.chapterId, ctx.userId);
      return db.select()
        .from(chapterVersions)
        .where(eq(chapterVersions.chapterId, input.chapterId))
        .orderBy(desc(chapterVersions.versionNumber));
    }),

  // 获取章节详情（含最新版本正文）
  getChapterDetail: protectedProcedure
    .input(z.object({ chapterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyChapterOwner(input.chapterId, ctx.userId);
      const [ch] = await db.select().from(chapters).where(eq(chapters.id, input.chapterId));
      if (!ch) throw new TRPCError({ code: 'NOT_FOUND', message: '章节不存在' });

      const [latestVersion] = await db.select()
        .from(chapterVersions)
        .where(eq(chapterVersions.chapterId, input.chapterId))
        .orderBy(desc(chapterVersions.versionNumber))
        .limit(1);

      // 获取单元信息
      const [unit] = await db.select().from(units).where(eq(units.id, ch.unitId));
      // 获取卷信息
      const [vol] = unit ? await db.select().from(volumes).where(eq(volumes.id, unit.volumeId)) : [null];

      return {
        chapter: ch,
        latestVersion,
        unit: unit || null,
        volume: vol || null,
      };
    }),

  // ===== 阶段性总结 =====

  // 生成单元总结
  generateUnitSummary: protectedProcedure
    .input(z.object({ unitId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const projectId = await verifyUnitOwner(input.unitId, ctx.userId);
      const [unit] = await db.select().from(units).where(eq(units.id, input.unitId));
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND', message: '单元不存在' });

      // 获取该单元所有章节的梗概
      const chList = await db.select({
        title: chapters.title,
        synopsis: chapters.synopsis,
        status: chapters.status,
      })
        .from(chapters)
        .where(and(eq(chapters.unitId, input.unitId), isNull(chapters.deletedAt)))
        .orderBy(asc(chapters.sortOrder));

      return {
        unitTitle: unit.title,
        unitSynopsis: unit.synopsis,
        chapters: chList,
        totalChapters: chList.length,
        finalizedChapters: chList.filter(c => c.status === 'final').length,
        prompt: `请为单元「${unit.title}」生成内容总结：

## 单元梗概
${unit.synopsis || '待补充'}

## 各章节梗概
${chList.map(c => `- ${c.title}：${c.synopsis || '（无梗概）'}`).join('\n')}

请总结：
1. 本单元核心剧情线
2. 重要角色变化和成长
3. 埋设的伏笔和悬念
4. 与下一单元的衔接建议`,
      };
    }),

  // 保存创作经验
  saveExperience: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      chapterId: z.string().uuid(),
      experience: z.object({
        highlights: z.array(z.string()).optional(),
        issues: z.array(z.string()).optional(),
        lessons: z.array(z.string()).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const content = JSON.stringify(input.experience, null, 2);
      await db.insert(memoryEntries).values({
        projectId: input.projectId,
        level: 'L2',
        category: '创作经验',
        content: content,
        sourceChapterId: input.chapterId,
        isActive: true,
      });
      return { ok: true };
    }),

  // 获取创作进度
  getProjectProgress: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const vols = await db.select({
        id: volumes.id,
        title: volumes.title,
      })
        .from(volumes)
        .where(and(eq(volumes.projectId, input.projectId), isNull(volumes.deletedAt)));

      let totalChapters = 0;
      let finalizedChapters = 0;
      let draftChapters = 0;
      let totalWords = 0;

      for (const vol of vols) {
        const unitList = await db.select({ id: units.id })
          .from(units)
          .where(and(eq(units.volumeId, vol.id), isNull(units.deletedAt)));

        for (const unit of unitList) {
          const chList = await db.select({
            status: chapters.status,
          })
            .from(chapters)
            .where(and(eq(chapters.unitId, unit.id), isNull(chapters.deletedAt)));

          for (const ch of chList) {
            totalChapters++;
            if (ch.status === 'final') finalizedChapters++;
            if (ch.status === 'draft') draftChapters++;
          }

          // 获取字数
          const versionResult = await db.select({
            wordCount: chapterVersions.wordCount,
          })
            .from(chapterVersions)
            .innerJoin(chapters, eq(chapterVersions.chapterId, chapters.id))
            .where(and(eq(chapters.unitId, unit.id), eq(chapterVersions.isFinal, true)))
            .limit(100);

          for (const v of versionResult) {
            totalWords += v.wordCount || 0;
          }
        }
      }

      return {
        totalVolumes: vols.length,
        totalChapters,
        finalizedChapters,
        draftChapters,
        pendingChapters: totalChapters - finalizedChapters - draftChapters,
        totalWords,
        progress: totalChapters > 0 ? Math.round((finalizedChapters / totalChapters) * 100) : 0,
      };
    }),

  // 保存创作经验（用于下一章任务书调用）
  saveChapterExperience: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      chapterId: z.string().uuid(),
      progressSummary: z.string(),
      experienceSummary: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);

      // 保存创作进度
      await db.insert(memoryEntries).values({
        projectId: input.projectId,
        level: 'L2',
        category: '创作进度',
        content: input.progressSummary,
        sourceChapterId: input.chapterId,
        isActive: true,
      });

      // 保存创作经验
      await db.insert(memoryEntries).values({
        projectId: input.projectId,
        level: 'L2',
        category: '创作经验',
        content: input.experienceSummary,
        sourceChapterId: input.chapterId,
        isActive: true,
      });

      return { ok: true };
    }),

  // 获取创作经验（用于下一章任务书）
  getChapterExperiences: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const progressEntries = await db.select({
        category: memoryEntries.category,
        content: memoryEntries.content,
        sourceChapterId: memoryEntries.sourceChapterId,
        createdAt: memoryEntries.createdAt,
      })
        .from(memoryEntries)
        .where(and(
          eq(memoryEntries.projectId, input.projectId),
          eq(memoryEntries.isActive, true),
          sql`${memoryEntries.category} IN ('创作进度', '创作经验')`,
        ))
        .orderBy(desc(memoryEntries.createdAt))
        .limit(10);

      return { entries: progressEntries };
    }),

  // ===== 创作经验管理（L0-L3 分级） =====

  // 按项目 + 等级 + 分类查询经验
  getMemories: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      level: z.enum(['L0', 'L1', 'L2', 'L3']).optional(),
      category: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const where = [
        eq(memoryEntries.projectId, input.projectId),
        eq(memoryEntries.isActive, true),
      ];
      if (input.level) where.push(eq(memoryEntries.level, input.level));
      if (input.category) where.push(eq(memoryEntries.category, input.category));

      return db.select()
        .from(memoryEntries)
        .where(and(...where))
        .orderBy(desc(memoryEntries.createdAt));
    }),

  // 手动创建经验条目
  createMemory: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      level: z.enum(['L0', 'L1', 'L2', 'L3']),
      category: z.string().optional(),
      content: z.string().min(1),
      chapterId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [entry] = await db.insert(memoryEntries).values({
        projectId: input.projectId,
        level: input.level,
        category: input.category || null,
        content: input.content,
        sourceChapterId: input.chapterId || null,
        isActive: true,
      }).returning();
      return entry;
    }),

  // 修改经验等级/内容
  updateMemory: protectedProcedure
    .input(z.object({
      memoryId: z.string().uuid(),
      level: z.enum(['L0', 'L1', 'L2', 'L3']).optional(),
      category: z.string().optional(),
      content: z.string().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db.select({ projectId: memoryEntries.projectId })
        .from(memoryEntries)
        .where(eq(memoryEntries.id, input.memoryId));
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: '经验不存在' });
      await verifyProjectOwner(existing.projectId, ctx.userId);

      const updateData: Record<string, unknown> = {};
      if (input.level) updateData.level = input.level;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.content !== undefined) updateData.content = input.content;
      updateData.updatedAt = new Date();

      const [updated] = await db.update(memoryEntries)
        .set(updateData)
        .where(eq(memoryEntries.id, input.memoryId))
        .returning();
      return updated;
    }),

  // 软删除经验
  deleteMemory: protectedProcedure
    .input(z.object({ memoryId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db.select({ projectId: memoryEntries.projectId })
        .from(memoryEntries)
        .where(eq(memoryEntries.id, input.memoryId));
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: '经验不存在' });
      await verifyProjectOwner(existing.projectId, ctx.userId);

      await db.update(memoryEntries)
        .set({ isActive: false })
        .where(eq(memoryEntries.id, input.memoryId));
      return { ok: true };
    }),

  // AI 分析草稿 vs 定稿差异，生成经验
  analyzeDraftVsFinal: protectedProcedure
    .input(z.object({ chapterId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const projectId = await verifyChapterOwner(input.chapterId, ctx.userId);

      // 获取最新的定稿版本
      const [finalVersion] = await db.select()
        .from(chapterVersions)
        .where(and(
          eq(chapterVersions.chapterId, input.chapterId),
          eq(chapterVersions.versionType, 'final'),
        ))
        .orderBy(desc(chapterVersions.versionNumber))
        .limit(1);

      if (!finalVersion) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '未找到定稿版本' });
      }

      // 获取最近的草稿版本（versionType='draft' 且 versionNumber 小于定稿）
      const [draftVersion] = await db.select()
        .from(chapterVersions)
        .where(and(
          eq(chapterVersions.chapterId, input.chapterId),
          eq(chapterVersions.versionType, 'draft'),
        ))
        .orderBy(desc(chapterVersions.versionNumber))
        .limit(1);

      if (!draftVersion) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '未找到草稿版本' });
      }

      const draftContent = draftVersion.content.slice(0, 15000);
      const finalContent = finalVersion.content.slice(0, 15000);

      const prompt = `以下是同一章节的草稿和定稿版本。请分析差异并总结经验：

## 草稿内容
${draftContent}

## 定稿内容
${finalContent}

请按以下格式输出分析结果：

### 草稿中存在的问题
（逻辑/节奏/人物/伏笔等方面的问题）

### 定稿相比草稿的主要改进
（具体的改进点和优化方向）

### 创作经验提炼
（从这次修改中可以提炼的经验教训）

### 等级分类建议
将每条经验按 L0-L3 分类：
- L0 = 必读铁则（必须做/绝对不能做的事项，核心要求）
- L1 = 重要改进（关键性的改进建议）
- L2 = 近期经验（本次修改中产生的具体经验）
- L3 = 修改示例（具体的修改对比示例）

每条经验格式：[Lx] 经验标题\n经验内容`;

      return {
        draftVersionId: draftVersion.id,
        draftVersionNumber: draftVersion.versionNumber,
        finalVersionId: finalVersion.id,
        finalVersionNumber: finalVersion.versionNumber,
        analysisPrompt: prompt,
        projectId,
        chapterId: input.chapterId,
      };
    }),

  // 将分析结果保存为经验条目（分析结果确认后调用）
  saveAnalysisResults: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      chapterId: z.string().uuid(),
      entries: z.array(z.object({
        level: z.enum(['L0', 'L1', 'L2', 'L3']),
        category: z.string().optional(),
        content: z.string().min(1),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);

      const values = input.entries.map(entry => ({
        projectId: input.projectId,
        level: entry.level,
        category: entry.category || null,
        content: entry.content,
        sourceChapterId: input.chapterId,
        isActive: true,
      }));

      if (values.length > 0) {
        await db.insert(memoryEntries).values(values);
      }

      return { ok: true, count: values.length };
    }),

  // 将经验导出为用户模板（独立副本）
  exportMemoryAsTemplate: protectedProcedure
    .input(z.object({
      memoryId: z.string().uuid(),
      title: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [memory] = await db.select({
        projectId: memoryEntries.projectId,
        content: memoryEntries.content,
        level: memoryEntries.level,
        category: memoryEntries.category,
      })
        .from(memoryEntries)
        .where(eq(memoryEntries.id, input.memoryId));

      if (!memory) throw new TRPCError({ code: 'NOT_FOUND', message: '经验不存在' });
      await verifyProjectOwner(memory.projectId, ctx.userId);

      // 获取章节标题作为模板标题的一部分
      let fullTitle = input.title || `${memory.category || '经验'} — ${memory.level}`;
      if (memory.category) {
        fullTitle = `[${memory.level}] ${memory.category}`;
      }

      const [template] = await db.insert(userTemplates).values({
        userId: ctx.userId,
        projectId: memory.projectId,
        title: fullTitle,
        content: memory.content,
        source: 'custom',
      }).returning();

      return template;
    }),

  // 批量导出经验为模板
  exportMemoriesAsTemplates: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      memoryIds: z.array(z.string().uuid()),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);

      const memories = await db.select()
        .from(memoryEntries)
        .where(and(
          eq(memoryEntries.projectId, input.projectId),
          eq(memoryEntries.isActive, true),
        ));

      const templates = [];
      for (const memory of memories.filter(m => input.memoryIds.includes(m.id))) {
        const [template] = await db.insert(userTemplates).values({
          userId: ctx.userId,
          projectId: input.projectId,
          title: `[${memory.level}] ${memory.category || '经验'}`,
          content: memory.content,
          source: 'custom',
        }).returning();
        templates.push(template);
      }

      return { ok: true, count: templates.length, templates };
    }),

  // 导出全部经验到模板库（L0-L3 合并为一个创作经验类目模板）
  exportAllMemoriesToTemplate: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);

      const memories = await db.select()
        .from(memoryEntries)
        .where(and(
          eq(memoryEntries.projectId, input.projectId),
          eq(memoryEntries.isActive, true),
        ))
        .orderBy(memoryEntries.level, memoryEntries.category);

      if (memories.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '暂无可导出的经验' });
      }

      // 按等级分组构建内容
      const levelLabels: Record<string, string> = {
        L0: '核心创作铁律',
        L1: '项目特色要求',
        L2: '近期重点问题',
        L3: '修改对比经验',
      };

      let content = `# 创作经验模板\n\n`;
      for (const level of ['L0', 'L1', 'L2', 'L3']) {
        const levelMemories = memories.filter(m => m.level === level);
        if (levelMemories.length > 0) {
          content += `## [${level}] ${levelLabels[level]}\n\n`;
          for (const m of levelMemories) {
            content += `### ${m.category || '未分类'}\n${m.content}\n\n`;
          }
        }
      }

      const [template] = await db.insert(userTemplates).values({
        userId: ctx.userId,
        projectId: input.projectId,
        title: '创作经验',
        content,
        source: 'custom',
        category: 'experience',
      }).returning();

      return { ok: true, templateId: template.id, count: memories.length };
    }),

  // 初始化预设经验模板
  seedDefaultExperiences: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);

      // 检查是否已有经验条目（避免重复初始化）
      const existing = await db.select({ id: memoryEntries.id })
        .from(memoryEntries)
        .where(and(
          eq(memoryEntries.projectId, input.projectId),
          eq(memoryEntries.isActive, true),
        ))
        .limit(1);

      if (existing.length > 0) {
        return { ok: true, seeded: false, message: '已有经验条目，跳过初始化' };
      }

      const defaultExperiences = [
        {
          level: 'L0' as const,
          category: '创作铁则',
          content: '正文必须紧扣章节梗概，不偏离、不自行添加梗概中没有的核心情节。这是创作的第一原则。',
        },
        {
          level: 'L0' as const,
          category: '创作铁则',
          content: '开篇以场景或动作描写开始，不打招呼、不自我介绍。直接进入剧情。',
        },
        {
          level: 'L0' as const,
          category: '创作铁则',
          content: '人物性格保持一致，不突兀反转。角色的行为必须符合其已建立的性格和动机。',
        },
        {
          level: 'L0' as const,
          category: '写作规范',
          content: '每个场景至少包含环境描写、人物动作、心理活动三要素。缺一不可。',
        },
        {
          level: 'L0' as const,
          category: '写作规范',
          content: '对话要符合人物身份和当前情绪。不同角色说话方式应有区分，体现各自性格。',
        },
        {
          level: 'L0' as const,
          category: '写作规范',
          content: '每章结尾设置悬念或钩子，吸引读者继续阅读下一章。',
        },
      ];

      const values = defaultExperiences.map(e => ({
        projectId: input.projectId,
        level: e.level,
        category: e.category,
        content: e.content,
        isActive: true,
      }));

      await db.insert(memoryEntries).values(values);

      return { ok: true, seeded: true, count: values.length };
    }),

  // 获取 L0-L3 经验供 AI 创作使用
  getMemoriesForWriter: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);

      // L0 全部获取，L1-L3 每级最近 10 条
      const l0Entries = await db.select({
        id: memoryEntries.id,
        level: memoryEntries.level,
        category: memoryEntries.category,
        content: memoryEntries.content,
        createdAt: memoryEntries.createdAt,
      })
        .from(memoryEntries)
        .where(and(
          eq(memoryEntries.projectId, input.projectId),
          eq(memoryEntries.level, 'L0'),
          eq(memoryEntries.isActive, true),
        ))
        .orderBy(asc(memoryEntries.createdAt));

      const l1ToL3Entries: Array<{
        id: string;
        level: string;
        category: string | null;
        content: string;
        createdAt: Date;
      }> = [];

      for (const level of ['L1', 'L2', 'L3'] as const) {
        const entries = await db.select({
          id: memoryEntries.id,
          level: memoryEntries.level,
          category: memoryEntries.category,
          content: memoryEntries.content,
          createdAt: memoryEntries.createdAt,
        })
          .from(memoryEntries)
          .where(and(
            eq(memoryEntries.projectId, input.projectId),
            eq(memoryEntries.level, level),
            eq(memoryEntries.isActive, true),
          ))
          .orderBy(desc(memoryEntries.createdAt))
          .limit(10);
        l1ToL3Entries.push(...entries);
      }

      const allEntries = [...l0Entries, ...l1ToL3Entries];

      // 格式化为文本
      const experienceText = allEntries.map(e =>
        `[${e.level}] ${e.category ? `【${e.category}】` : ''}\n${e.content}`,
      ).join('\n\n');

      return {
        entries: allEntries,
        formattedText: experienceText,
      };
    }),
});
