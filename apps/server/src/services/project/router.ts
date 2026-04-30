// 项目管理 tRPC 路由
import { z } from 'zod';
import { eq, and, asc, desc, ne, isNull, or, sql, not, gte, lt, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, verifyProjectOwner } from '../../trpc';
import { db } from '../../db';
import { projects, volumes, units, chapters, chapterVersions, outlineVersions, settings, settingRelationships, aiRoles, genrePresets, storyNarratives, settingsDeliveries, conversations, editLogs } from '../../db/schema';
import { checkContentFingerprint } from '../template/content-fingerprint';

export const projectRouter = router({
  // 创建项目
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      type: z.enum(['novel', 'webnovel', 'screenplay', 'prompt_gen']).default('novel'),
      genre: z.string().optional(),
      genreTag: z.string().optional(),
      style: z.string().optional(),
      methodology: z.string().optional(),
      config: z.record(z.unknown()).optional(),
      roles: z.array(z.object({
        name: z.string(),
        role: z.string(),
        systemPrompt: z.string().default(''),
        isDefault: z.boolean().default(false),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { roles, genreTag, style, ...projectData } = input;
      const [project] = await db.insert(projects).values({
        userId: ctx.userId,
        ...projectData,
        genre: input.genre || null,
        genreTag: (genreTag as any) || null,
        style: style || null,
        methodology: input.methodology || null,
      }).returning();

      if (roles?.length) {
        // 使用传入的角色预设（前端已根据题材类型生成对应提示词）
        await db.insert(aiRoles).values(
          roles.map(r => ({
            projectId: project!.id,
            name: r.name,
            role: r.role,
            systemPrompt: r.systemPrompt || '',
            isDefault: true,
          })),
        );
      }

      return project;
    }),

  // 项目列表（排除已删除）
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(projects)
      .where(and(eq(projects.userId, ctx.userId), or(isNull(projects.status), ne(projects.status, 'deleted'))))
      .orderBy(asc(projects.createdAt));
  }),

  // 项目详情（排除已删除）
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [project] = await db.select().from(projects)
        .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.userId), or(isNull(projects.status), ne(projects.status, 'deleted'))));
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: '项目不存在' });
      return project;
    }),

  // 更新项目（排除已删除）
  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      genre: z.string().optional(),
      style: z.string().optional(),
      methodology: z.string().optional(),
      config: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await db.update(projects).set({ ...data, updatedAt: new Date() })
        .where(and(eq(projects.id, id), eq(projects.userId, ctx.userId), or(isNull(projects.status), ne(projects.status, 'deleted'))))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: '项目不存在' });
      return updated;
    }),

  // 软删除项目
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db.update(projects)
        .set({ status: 'deleted', deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.userId), or(isNull(projects.status), ne(projects.status, 'deleted'))))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: '项目不存在' });
      return { success: true };
    }),

  // 恢复已删除项目
  restore: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db.update(projects)
        .set({ status: 'active', deletedAt: null, updatedAt: new Date() })
        .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.userId), eq(projects.status, 'deleted')))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: '项目不存在或未被删除' });
      return { success: true };
    }),

  // 回收站列表 — 已删除项目
  listDeleted: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(projects)
      .where(and(eq(projects.userId, ctx.userId), eq(projects.status, 'deleted')))
      .orderBy(desc(projects.deletedAt));
  }),

  // 永久删除项目（物理删除）
  permanentDelete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [project] = await db.select().from(projects)
        .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.userId), eq(projects.status, 'deleted')));
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: '项目不存在或未被删除' });
      await db.delete(projects).where(eq(projects.id, input.id));
      return { success: true };
    }),

  // 清理 30 天前的已删除项目（定时任务调用）
  cleanupOldDeleted: protectedProcedure.mutation(async ({ ctx }) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // 查找超期的已删除项目
    const oldProjects = await db.select({ id: projects.id, userId: projects.userId, name: projects.name })
      .from(projects)
      .where(and(eq(projects.userId, ctx.userId), eq(projects.status, 'deleted'), lt(projects.deletedAt, thirtyDaysAgo)));

    for (const project of oldProjects) {
      // 物理删除项目及其关联数据
      await db.delete(projects).where(eq(projects.id, project.id));
    }
    return { cleanedCount: oldProjects.length };
  }),

  // ========== 卷管理 ==========
  createVolume: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), title: z.string(), synopsis: z.string().optional(), sortOrder: z.number().default(0) }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [vol] = await db.insert(volumes).values(input).returning();
      return vol;
    }),

  listVolumes: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      return db.select().from(volumes)
        .where(and(eq(volumes.projectId, input.projectId), or(isNull(volumes.status), ne(volumes.status, 'deleted'))))
        .orderBy(asc(volumes.sortOrder));
    }),

  // 获取完整大纲树（卷 → 单元 → 章节），用于 writer 角色构建章节上下文
  getOutlineTree: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const volList = await db.select().from(volumes)
        .where(and(eq(volumes.projectId, input.projectId), or(isNull(volumes.status), ne(volumes.status, 'deleted'))))
        .orderBy(asc(volumes.sortOrder));

      const result = [];
      for (const vol of volList) {
        const unitList = await db.select().from(units)
          .where(and(eq(units.volumeId, vol.id), or(isNull(units.status), ne(units.status, 'deleted'))))
          .orderBy(asc(units.sortOrder));
        const unitsWithChapters = [];
        for (const unit of unitList) {
          const chapterList = await db.select({
            id: chapters.id,
            title: chapters.title,
            synopsis: chapters.synopsis,
            status: chapters.status,
          }).from(chapters)
            .where(and(eq(chapters.unitId, unit.id), or(isNull(chapters.status), ne(chapters.status, 'deleted'))))
            .orderBy(asc(chapters.sortOrder));
          unitsWithChapters.push({ ...unit, chapters: chapterList });
        }
        result.push({ ...vol, units: unitsWithChapters });
      }
      return result;
    }),

  // 更新卷梗概（带版本管理）
  updateVolume: protectedProcedure
    .input(z.object({ id: z.string().uuid(), projectId: z.string().uuid(), title: z.string().optional(), synopsis: z.string().optional(), sortOrder: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const { id, projectId, synopsis, ...rest } = input;

      // 如果更新梗概，保存版本
      if (synopsis !== undefined) {
        const [latest] = await db.select({ versionNumber: outlineVersions.versionNumber })
          .from(outlineVersions)
          .where(and(eq(outlineVersions.entityType, 'volume'), eq(outlineVersions.entityId, id)))
          .orderBy(desc(outlineVersions.versionNumber)).limit(1);
        const nextVersion = (latest?.versionNumber ?? 0) + 1;
        await db.insert(outlineVersions).values({
          entityType: 'volume', entityId: id, synopsis, versionNumber: nextVersion,
        });
      }

      const [updated] = await db.update(volumes).set({ ...rest, synopsis })
        .where(and(eq(volumes.id, id), eq(volumes.projectId, projectId)))
        .returning();
      return updated;
    }),

  // 更新单元梗概（带版本管理）
  updateUnit: protectedProcedure
    .input(z.object({ id: z.string().uuid(), volumeId: z.string().uuid(), title: z.string().optional(), synopsis: z.string().optional(), sortOrder: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, input.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND', message: '卷不存在' });
      await verifyProjectOwner(vol.projectId, ctx.userId);
      const { id, volumeId, synopsis, ...rest } = input;

      if (synopsis !== undefined) {
        const [latest] = await db.select({ versionNumber: outlineVersions.versionNumber })
          .from(outlineVersions)
          .where(and(eq(outlineVersions.entityType, 'unit'), eq(outlineVersions.entityId, id)))
          .orderBy(desc(outlineVersions.versionNumber)).limit(1);
        const nextVersion = (latest?.versionNumber ?? 0) + 1;
        await db.insert(outlineVersions).values({
          entityType: 'unit', entityId: id, synopsis, versionNumber: nextVersion,
        });
      }

      const [updated] = await db.update(units).set({ ...rest, synopsis })
        .where(and(eq(units.id, id), eq(units.volumeId, volumeId)))
        .returning();
      return updated;
    }),

  // 更新章节梗概（带版本管理）
  updateChapterSynopsis: protectedProcedure
    .input(z.object({ id: z.string().uuid(), unitId: z.string().uuid(), synopsis: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [unit] = await db.select({ volumeId: units.volumeId }).from(units).where(eq(units.id, input.unitId));
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND', message: '单元不存在' });
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, unit.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND', message: '卷不存在' });
      await verifyProjectOwner(vol.projectId, ctx.userId);

      const [latest] = await db.select({ versionNumber: outlineVersions.versionNumber })
        .from(outlineVersions)
        .where(and(eq(outlineVersions.entityType, 'chapter'), eq(outlineVersions.entityId, input.id)))
        .orderBy(desc(outlineVersions.versionNumber)).limit(1);
      const nextVersion = (latest?.versionNumber ?? 0) + 1;
      await db.insert(outlineVersions).values({
        entityType: 'chapter', entityId: input.id, synopsis: input.synopsis, versionNumber: nextVersion,
      });

      const [updated] = await db.update(chapters).set({ synopsis: input.synopsis, updatedAt: new Date() })
        .where(and(eq(chapters.id, input.id), eq(chapters.unitId, input.unitId)))
        .returning();
      return updated;
    }),

  // 获取大纲版本列表
  listOutlineVersions: protectedProcedure
    .input(z.object({ entityType: z.enum(['volume', 'unit', 'chapter']), entityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return db.select().from(outlineVersions)
        .where(and(
          eq(outlineVersions.entityType, input.entityType),
          eq(outlineVersions.entityId, input.entityId),
          isNull(outlineVersions.deletedAt),
        ))
        .orderBy(desc(outlineVersions.versionNumber));
    }),

  // 删除大纲版本
  deleteOutlineVersion: protectedProcedure
    .input(z.object({ versionId: z.string().uuid(), projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      await db.update(outlineVersions).set({ deletedAt: new Date() })
        .where(eq(outlineVersions.id, input.versionId));
      return { success: true };
    }),

  // 恢复大纲版本（覆盖当前梗概）
  restoreOutlineVersion: protectedProcedure
    .input(z.object({ versionId: z.string().uuid(), projectId: z.string().uuid(), entityType: z.enum(['volume', 'unit', 'chapter']), entityId: z.string().uuid(), parentEntityId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [v] = await db.select().from(outlineVersions)
        .where(and(eq(outlineVersions.id, input.versionId), eq(outlineVersions.entityType, input.entityType), eq(outlineVersions.entityId, input.entityId)));
      if (!v) throw new TRPCError({ code: 'NOT_FOUND', message: '版本不存在' });

      // 覆盖当前梗概
      if (input.entityType === 'volume') {
        await db.update(volumes).set({ synopsis: v.synopsis })
          .where(and(eq(volumes.id, input.entityId), eq(volumes.projectId, input.projectId)));
      } else if (input.entityType === 'unit' && input.parentEntityId) {
        await db.update(units).set({ synopsis: v.synopsis })
          .where(and(eq(units.id, input.entityId), eq(units.volumeId, input.parentEntityId)));
      } else if (input.entityType === 'chapter' && input.parentEntityId) {
        await db.update(chapters).set({ synopsis: v.synopsis })
          .where(and(eq(chapters.id, input.entityId), eq(chapters.unitId, input.parentEntityId)));
      }

      return { synopsis: v.synopsis, versionNumber: v.versionNumber };
    }),

  deleteVolume: protectedProcedure
    .input(z.object({ id: z.string().uuid(), projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const now = new Date();
      // 级联软删除：卷下的单元 → 单元下的章节
      const unitList = await db.select({ id: units.id }).from(units).where(eq(units.volumeId, input.id));
      for (const unit of unitList) {
        await db.update(chapters).set({ status: 'deleted', deletedAt: now })
          .where(and(eq(chapters.unitId, unit.id), or(isNull(chapters.status), ne(chapters.status, 'deleted'))));
      }
      await db.update(units).set({ status: 'deleted', deletedAt: now })
        .where(and(eq(units.volumeId, input.id), or(isNull(units.status), ne(units.status, 'deleted'))));
      await db.update(volumes).set({ status: 'deleted', deletedAt: now })
        .where(and(eq(volumes.id, input.id), eq(volumes.projectId, input.projectId), or(isNull(volumes.status), ne(volumes.status, 'deleted'))));
      return { success: true };
    }),

  // ========== 单元管理 ==========
  createUnit: protectedProcedure
    .input(z.object({ volumeId: z.string().uuid(), title: z.string(), synopsis: z.string().optional(), structure: z.string().default('four_act'), sortOrder: z.number().default(0) }))
    .mutation(async ({ ctx, input }) => {
      // 通过 volume → project 验证归属
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, input.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND', message: '卷不存在' });
      await verifyProjectOwner(vol.projectId, ctx.userId);
      const [unit] = await db.insert(units).values(input).returning();
      return unit;
    }),

  listUnits: protectedProcedure
    .input(z.object({ volumeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, input.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND', message: '卷不存在' });
      await verifyProjectOwner(vol.projectId, ctx.userId);
      return db.select().from(units)
        .where(and(eq(units.volumeId, input.volumeId), or(isNull(units.status), ne(units.status, 'deleted'))))
        .orderBy(asc(units.sortOrder));
    }),

  deleteUnit: protectedProcedure
    .input(z.object({ id: z.string().uuid(), volumeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, input.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND', message: '卷不存在' });
      await verifyProjectOwner(vol.projectId, ctx.userId);
      const now = new Date();
      // 级联软删除：单元下的章节
      await db.update(chapters).set({ status: 'deleted', deletedAt: now })
        .where(and(eq(chapters.unitId, input.id), or(isNull(chapters.status), ne(chapters.status, 'deleted'))));
      await db.update(units).set({ status: 'deleted', deletedAt: now })
        .where(and(eq(units.id, input.id), eq(units.volumeId, input.volumeId), or(isNull(units.status), ne(units.status, 'deleted'))));
      return { success: true };
    }),

  // ========== 章节管理 ==========
  createChapter: protectedProcedure
    .input(z.object({ unitId: z.string().uuid(), title: z.string(), synopsis: z.string().optional(), sortOrder: z.number().default(0) }))
    .mutation(async ({ ctx, input }) => {
      const [unit] = await db.select({ volumeId: units.volumeId }).from(units).where(eq(units.id, input.unitId));
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND', message: '单元不存在' });
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, unit.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND', message: '卷不存在' });
      await verifyProjectOwner(vol.projectId, ctx.userId);
      const [ch] = await db.insert(chapters).values(input).returning();
      return ch;
    }),

  listChapters: protectedProcedure
    .input(z.object({ unitId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [unit] = await db.select({ volumeId: units.volumeId }).from(units).where(eq(units.id, input.unitId));
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND', message: '单元不存在' });
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, unit.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND', message: '卷不存在' });
      await verifyProjectOwner(vol.projectId, ctx.userId);
      return db.select().from(chapters)
        .where(and(eq(chapters.unitId, input.unitId), or(isNull(chapters.status), ne(chapters.status, 'deleted'))))
        .orderBy(asc(chapters.sortOrder));
    }),

  // 获取项目中最近编辑的章节
  getRecentChapter: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const vols = await db.select({ id: volumes.id }).from(volumes)
        .where(and(eq(volumes.projectId, input.projectId), isNull(volumes.deletedAt)));
      if (vols.length === 0) return null;
      const volIds = vols.map(v => v.id);
      const unitRows = await db.select({ id: units.id }).from(units)
        .where(and(inArray(units.volumeId, volIds), isNull(units.deletedAt)));
      if (unitRows.length === 0) return null;
      const unitIds = unitRows.map(u => u.id);
      const [recent] = await db.select({
        id: chapters.id,
        unitId: chapters.unitId,
        title: chapters.title,
        updatedAt: chapters.updatedAt,
      }).from(chapters)
        .where(and(inArray(chapters.unitId, unitIds), or(isNull(chapters.status), ne(chapters.status, 'deleted'))))
        .orderBy(desc(chapters.updatedAt))
        .limit(1);
      return recent || null;
    }),

  deleteChapter: protectedProcedure
    .input(z.object({ id: z.string().uuid(), unitId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [unit] = await db.select({ volumeId: units.volumeId }).from(units).where(eq(units.id, input.unitId));
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND', message: '单元不存在' });
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, unit.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND', message: '卷不存在' });
      await verifyProjectOwner(vol.projectId, ctx.userId);
      await db.update(chapters).set({ status: 'deleted', deletedAt: new Date() })
        .where(and(eq(chapters.id, input.id), eq(chapters.unitId, input.unitId), or(isNull(chapters.status), ne(chapters.status, 'deleted'))));
      return { success: true };
    }),

  // ========== 回收站 — 已删除卷 ==========
  listDeletedVolumes: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      return db.select().from(volumes)
        .where(and(eq(volumes.projectId, input.projectId), eq(volumes.status, 'deleted')))
        .orderBy(desc(volumes.deletedAt));
    }),

  restoreVolume: protectedProcedure
    .input(z.object({ id: z.string().uuid(), projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      // 恢复卷时同时恢复其下的单元和章节
      const unitList = await db.select({ id: units.id }).from(units).where(eq(units.volumeId, input.id));
      for (const unit of unitList) {
        await db.update(chapters).set({ status: 'active', deletedAt: null })
          .where(and(eq(chapters.unitId, unit.id), eq(chapters.status, 'deleted')));
      }
      await db.update(units).set({ status: 'active', deletedAt: null })
        .where(and(eq(units.volumeId, input.id), eq(units.status, 'deleted')));
      const [updated] = await db.update(volumes).set({ status: 'active', deletedAt: null })
        .where(and(eq(volumes.id, input.id), eq(volumes.projectId, input.projectId), eq(volumes.status, 'deleted')))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: '卷不存在或未被删除' });
      return { success: true };
    }),

  // ========== 回收站 — 已删除单元 ==========
  listDeletedUnits: protectedProcedure
    .input(z.object({ volumeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, input.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND', message: '卷不存在' });
      await verifyProjectOwner(vol.projectId, ctx.userId);
      return db.select().from(units)
        .where(and(eq(units.volumeId, input.volumeId), eq(units.status, 'deleted')))
        .orderBy(desc(units.deletedAt));
    }),

  restoreUnit: protectedProcedure
    .input(z.object({ id: z.string().uuid(), volumeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, input.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND', message: '卷不存在' });
      await verifyProjectOwner(vol.projectId, ctx.userId);
      // 恢复单元时同时恢复其下的章节
      await db.update(chapters).set({ status: 'active', deletedAt: null })
        .where(and(eq(chapters.unitId, input.id), eq(chapters.status, 'deleted')));
      const [updated] = await db.update(units).set({ status: 'active', deletedAt: null })
        .where(and(eq(units.id, input.id), eq(units.volumeId, input.volumeId), eq(units.status, 'deleted')))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: '单元不存在或未被删除' });
      return { success: true };
    }),

  // ========== 回收站 — 已删除章节 ==========
  listDeletedChapters: protectedProcedure
    .input(z.object({ unitId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [unit] = await db.select({ volumeId: units.volumeId }).from(units).where(eq(units.id, input.unitId));
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND', message: '单元不存在' });
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, unit.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND', message: '卷不存在' });
      await verifyProjectOwner(vol.projectId, ctx.userId);
      return db.select().from(chapters)
        .where(and(eq(chapters.unitId, input.unitId), eq(chapters.status, 'deleted')))
        .orderBy(desc(chapters.deletedAt));
    }),

  restoreChapter: protectedProcedure
    .input(z.object({ id: z.string().uuid(), unitId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [unit] = await db.select({ volumeId: units.volumeId }).from(units).where(eq(units.id, input.unitId));
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND', message: '单元不存在' });
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, unit.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND', message: '卷不存在' });
      await verifyProjectOwner(vol.projectId, ctx.userId);
      const [updated] = await db.update(chapters).set({ status: 'active', deletedAt: null })
        .where(and(eq(chapters.id, input.id), eq(chapters.unitId, input.unitId), eq(chapters.status, 'deleted')))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: '章节不存在或未被删除' });
      return { success: true };
    }),

  // 获取章节详情（含最新版本内容）
  getChapter: protectedProcedure
    .input(z.object({ chapterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [ch] = await db.select().from(chapters).where(eq(chapters.id, input.chapterId));
      if (!ch) throw new TRPCError({ code: 'NOT_FOUND', message: '章节不存在' });
      const [unit] = await db.select({ volumeId: units.volumeId }).from(units).where(eq(units.id, ch.unitId));
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND' });
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, unit.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND' });
      await verifyProjectOwner(vol.projectId, ctx.userId);
      const [latestVersion] = await db.select()
        .from(chapterVersions)
        .where(eq(chapterVersions.chapterId, input.chapterId))
        .orderBy(desc(chapterVersions.versionNumber))
        .limit(1);
      return { ...ch, latestContent: latestVersion?.content ?? '', latestVersion: latestVersion ?? null };
    }),

  // 保存章节版本
  saveChapterVersion: protectedProcedure
    .input(z.object({
      chapterId: z.string().uuid(),
      content: z.string(),
      isFinal: z.boolean().default(false),
      versionType: z.enum(['task_brief', 'draft', 'final']).default('draft'),
    }))
    .mutation(async ({ ctx, input }) => {
      // 验证归属链: chapter → unit → volume → project
      const [ch] = await db.select({ unitId: chapters.unitId }).from(chapters).where(eq(chapters.id, input.chapterId));
      if (!ch) throw new TRPCError({ code: 'NOT_FOUND', message: '章节不存在' });
      const [unit] = await db.select({ volumeId: units.volumeId }).from(units).where(eq(units.id, ch.unitId));
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND' });
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, unit.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND' });
      await verifyProjectOwner(vol.projectId, ctx.userId);

      // 获取当前最大版本号
      const [latest] = await db.select({ versionNumber: chapterVersions.versionNumber })
        .from(chapterVersions)
        .where(eq(chapterVersions.chapterId, input.chapterId))
        .orderBy(desc(chapterVersions.versionNumber))
        .limit(1);
      const nextVersion = (latest?.versionNumber ?? 0) + 1;
      const wordCount = input.content.replace(/\s/g, '').length;

      const [version] = await db.insert(chapterVersions).values({
        chapterId: input.chapterId,
        content: input.content,
        versionNumber: nextVersion,
        isFinal: input.isFinal,
        wordCount,
        versionType: input.versionType,
      }).returning();

      await db.update(chapters).set({
        status: input.isFinal ? 'final' : 'draft',
        updatedAt: new Date(),
      }).where(eq(chapters.id, input.chapterId));

      // 内容指纹检测（非阻塞）
      let warning: { templateId: string } | undefined;
      if (input.content.length >= 200) {
        try {
          const result = await checkContentFingerprint(input.content);
          if (result.matched && result.templateId) {
            warning = { templateId: result.templateId };
          }
        } catch { /* fingerprint check should never block save */ }
      }

      return { ...version, warning };
    }),

  // 获取章节版本列表
  listChapterVersions: protectedProcedure
    .input(z.object({ chapterId: z.string().uuid(), includeArchived: z.boolean().default(false), versionType: z.enum(['task_brief', 'draft', 'final']).optional() }))
    .query(async ({ ctx, input }) => {
      const [ch] = await db.select({ unitId: chapters.unitId }).from(chapters).where(eq(chapters.id, input.chapterId));
      if (!ch) throw new TRPCError({ code: 'NOT_FOUND', message: '章节不存在' });
      const [unit] = await db.select({ volumeId: units.volumeId }).from(units).where(eq(units.id, ch.unitId));
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND' });
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, unit.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND' });
      await verifyProjectOwner(vol.projectId, ctx.userId);
      const conditions = [eq(chapterVersions.chapterId, input.chapterId), isNull(chapterVersions.deletedAt)];
      if (!input.includeArchived) conditions.push(ne(chapterVersions.status, 'archived'));
      if (input.versionType) conditions.push(eq(chapterVersions.versionType, input.versionType));
      return db.select().from(chapterVersions)
        .where(and(...conditions))
        .orderBy(asc(chapterVersions.versionNumber), asc(chapterVersions.subVersionNumber));
    }),

  // 获取单个版本详情
  getChapterVersion: protectedProcedure
    .input(z.object({ versionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [v] = await db.select().from(chapterVersions).where(eq(chapterVersions.id, input.versionId));
      if (!v) throw new TRPCError({ code: 'NOT_FOUND' });
      const [ch] = await db.select({ unitId: chapters.unitId }).from(chapters).where(eq(chapters.id, v.chapterId));
      if (!ch) throw new TRPCError({ code: 'NOT_FOUND' });
      const [unit] = await db.select({ volumeId: units.volumeId }).from(units).where(eq(units.id, ch.unitId));
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND' });
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, unit.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND' });
      await verifyProjectOwner(vol.projectId, ctx.userId);
      return v;
    }),

  // 软删除版本 — 移入回收站（30天自动清理）
  deleteChapterVersion: protectedProcedure
    .input(z.object({ versionId: z.string().uuid(), chapterId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [v] = await db.select().from(chapterVersions).where(and(eq(chapterVersions.id, input.versionId), eq(chapterVersions.chapterId, input.chapterId)));
      if (!v) throw new TRPCError({ code: 'NOT_FOUND' });
      await db.update(chapterVersions).set({ deletedAt: new Date(), status: 'deleted' }).where(eq(chapterVersions.id, input.versionId));
      return { success: true };
    }),

  // 回收站 — 已删除版本（30天内）
  getRecycleBinVersions: protectedProcedure
    .input(z.object({ chapterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [ch] = await db.select({ unitId: chapters.unitId }).from(chapters).where(eq(chapters.id, input.chapterId));
      if (!ch) throw new TRPCError({ code: 'NOT_FOUND', message: '章节不存在' });
      const [unit] = await db.select({ volumeId: units.volumeId }).from(units).where(eq(units.id, ch.unitId));
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND' });
      const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, unit.volumeId));
      if (!vol) throw new TRPCError({ code: 'NOT_FOUND' });
      await verifyProjectOwner(vol.projectId, ctx.userId);

      // 自动清理超过 30 天的删除版本
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await db.delete(chapterVersions).where(and(
        eq(chapterVersions.chapterId, input.chapterId),
        not(isNull(chapterVersions.deletedAt)),
        lt(chapterVersions.deletedAt, thirtyDaysAgo),
      ));

      return db.select().from(chapterVersions)
        .where(and(
          eq(chapterVersions.chapterId, input.chapterId),
          not(isNull(chapterVersions.deletedAt)),
          gte(chapterVersions.deletedAt, thirtyDaysAgo),
        ))
        .orderBy(desc(chapterVersions.deletedAt));
    }),

  // 恢复已删除版本
  restoreDeletedVersion: protectedProcedure
    .input(z.object({ versionId: z.string().uuid(), chapterId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [v] = await db.select().from(chapterVersions)
        .where(and(eq(chapterVersions.id, input.versionId), eq(chapterVersions.chapterId, input.chapterId), not(isNull(chapterVersions.deletedAt))));
      if (!v) throw new TRPCError({ code: 'NOT_FOUND', message: '版本不存在或已被清理' });
      await db.update(chapterVersions).set({ deletedAt: null, status: 'active' }).where(eq(chapterVersions.id, input.versionId));
      return { success: true };
    }),

  // 永久删除版本（不可恢复）
  permanentDeleteVersion: protectedProcedure
    .input(z.object({ versionId: z.string().uuid(), chapterId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [v] = await db.select().from(chapterVersions)
        .where(and(eq(chapterVersions.id, input.versionId), eq(chapterVersions.chapterId, input.chapterId)));
      if (!v) throw new TRPCError({ code: 'NOT_FOUND' });
      await db.delete(chapterVersions).where(eq(chapterVersions.id, input.versionId));
      return { success: true };
    }),

  // 清理过期删除版本（>30天）
  cleanupExpiredVersions: protectedProcedure.mutation(async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db.delete(chapterVersions).where(and(not(isNull(chapterVersions.deletedAt)), lt(chapterVersions.deletedAt, thirtyDaysAgo)));
    return { success: true };
  }),

  // 归档版本
  archiveChapterVersion: protectedProcedure
    .input(z.object({ versionId: z.string().uuid(), chapterId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(chapterVersions).set({ status: 'archived' }).where(and(eq(chapterVersions.id, input.versionId), eq(chapterVersions.chapterId, input.chapterId)));
      return { success: true };
    }),

  // 恢复归档版本
  restoreChapterVersion: protectedProcedure
    .input(z.object({ versionId: z.string().uuid(), chapterId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(chapterVersions).set({ status: 'active' }).where(and(eq(chapterVersions.id, input.versionId), eq(chapterVersions.chapterId, input.chapterId)));
      return { success: true };
    }),

  // 创建子版本
  createSubVersion: protectedProcedure
    .input(z.object({ parentVersionId: z.string().uuid(), chapterId: z.string().uuid(), content: z.string(), label: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [parent] = await db.select().from(chapterVersions).where(and(eq(chapterVersions.id, input.parentVersionId), isNull(chapterVersions.parentVersionId)));
      if (!parent) throw new TRPCError({ code: 'BAD_REQUEST', message: '只能从主版本创建子版本' });
      const [latestSub] = await db.select({ subVersionNumber: chapterVersions.subVersionNumber }).from(chapterVersions)
        .where(eq(chapterVersions.parentVersionId, input.parentVersionId))
        .orderBy(desc(chapterVersions.subVersionNumber)).limit(1);
      const nextSub = (latestSub?.subVersionNumber ?? 0) + 1;
      const wordCount = input.content.replace(/\s/g, '').length;
      const [v] = await db.insert(chapterVersions).values({
        chapterId: input.chapterId, content: input.content, versionNumber: parent.versionNumber,
        parentVersionId: input.parentVersionId, subVersionNumber: nextSub,
        label: input.label, wordCount, versionType: parent.versionType,
      }).returning();
      return v;
    }),

  // 转移版本到另一章节
  transferVersion: protectedProcedure
    .input(z.object({ versionId: z.string().uuid(), fromChapterId: z.string().uuid(), toChapterId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [v] = await db.select().from(chapterVersions).where(and(eq(chapterVersions.id, input.versionId), eq(chapterVersions.chapterId, input.fromChapterId)));
      if (!v) throw new TRPCError({ code: 'NOT_FOUND' });
      const [latest] = await db.select({ versionNumber: chapterVersions.versionNumber }).from(chapterVersions)
        .where(eq(chapterVersions.chapterId, input.toChapterId))
        .orderBy(desc(chapterVersions.versionNumber)).limit(1);
      const nextVersion = (latest?.versionNumber ?? 0) + 1;
      const [newV] = await db.insert(chapterVersions).values({
        chapterId: input.toChapterId, content: v.content, versionNumber: nextVersion,
        label: v.label ? `[转移] ${v.label}` : '[转移]',
        sourceChapterId: input.fromChapterId, wordCount: v.wordCount, versionType: v.versionType,
      }).returning();
      await db.update(chapterVersions).set({ status: 'archived' }).where(eq(chapterVersions.id, input.versionId));
      return newV;
    }),

  // 更新版本标签
  updateVersionLabel: protectedProcedure
    .input(z.object({ versionId: z.string().uuid(), label: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db.update(chapterVersions).set({ label: input.label }).where(eq(chapterVersions.id, input.versionId)).returning();
      return updated;
    }),

  // ========== 设定管理 ==========
  createSetting: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), category: z.string(), title: z.string(), content: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [s] = await db.insert(settings).values(input).returning();
      return s;
    }),

  listSettings: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      return db.select().from(settings)
        .where(and(eq(settings.projectId, input.projectId), isNull(settings.deletedAt)))
        .orderBy(asc(settings.sortOrder));
    }),

  updateSetting: protectedProcedure
    .input(z.object({ id: z.string().uuid(), projectId: z.string().uuid(), title: z.string().optional(), content: z.string().optional(), category: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const { id, projectId, ...data } = input;
      const [updated] = await db.update(settings).set({ ...data, updatedAt: new Date() }).where(eq(settings.id, id)).returning();
      return updated;
    }),

  deleteSetting: protectedProcedure
    .input(z.object({ id: z.string().uuid(), projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      await db.update(settings).set({ deletedAt: new Date() })
        .where(and(eq(settings.id, input.id), eq(settings.projectId, input.projectId), isNull(settings.deletedAt)));
      return { success: true };
    }),

  // 回收站 — 已删除设定
  listDeletedSettings: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      return db.select().from(settings)
        .where(and(eq(settings.projectId, input.projectId), not(isNull(settings.deletedAt))))
        .orderBy(desc(settings.deletedAt));
    }),

  restoreSetting: protectedProcedure
    .input(z.object({ id: z.string().uuid(), projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [updated] = await db.update(settings).set({ deletedAt: null })
        .where(and(eq(settings.id, input.id), eq(settings.projectId, input.projectId)))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: '设定不存在或未被删除' });
      return { success: true };
    }),

  // ========== 设定关系 ==========
  listRelationships: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      return db.select().from(settingRelationships)
        .where(eq(settingRelationships.projectId, input.projectId));
    }),

  createRelationship: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      sourceId: z.string().uuid(),
      targetId: z.string().uuid(),
      relationType: z.string().max(30),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [rel] = await db.insert(settingRelationships).values({
        projectId: input.projectId,
        sourceId: input.sourceId,
        targetId: input.targetId,
        relationType: input.relationType,
        description: input.description || null,
      }).returning();
      return rel;
    }),

  deleteRelationship: protectedProcedure
    .input(z.object({ id: z.string().uuid(), projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      await db.delete(settingRelationships)
        .where(and(eq(settingRelationships.id, input.id), eq(settingRelationships.projectId, input.projectId)));
      return { success: true };
    }),

  // ========== 故事脉络 ==========
  createNarrative: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), title: z.string(), content: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      // 如果已有活跃脉络，先标记为历史
      await db.update(storyNarratives).set({ status: 'archived', updatedAt: new Date() })
        .where(and(eq(storyNarratives.projectId, input.projectId), eq(storyNarratives.status, 'active')));
      const [narrative] = await db.insert(storyNarratives).values(input).returning();
      return narrative;
    }),

  updateNarrative: protectedProcedure
    .input(z.object({ id: z.string().uuid(), projectId: z.string().uuid(), title: z.string().optional(), content: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const { id, projectId, ...data } = input;
      const [updated] = await db.update(storyNarratives).set({ ...data, updatedAt: new Date() })
        .where(and(eq(storyNarratives.id, id), eq(storyNarratives.projectId, projectId)))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: '故事脉络不存在' });
      return updated;
    }),

  getNarrative: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [narrative] = await db.select().from(storyNarratives)
        .where(and(eq(storyNarratives.projectId, input.projectId), eq(storyNarratives.status, 'active')))
        .orderBy(desc(storyNarratives.createdAt))
        .limit(1);
      return narrative || null;
    }),

  // ========== AI 角色管理 ==========
  listRoles: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      return db.select().from(aiRoles).where(eq(aiRoles.projectId, input.projectId));
    }),

  updateRole: protectedProcedure
    .input(z.object({ id: z.string().uuid(), projectId: z.string().uuid(), name: z.string().optional(), systemPrompt: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const { id, projectId, ...data } = input;
      const [updated] = await db.update(aiRoles).set(data).where(eq(aiRoles.id, id)).returning();
      return updated;
    }),

  // 项目创作进度统计
  getProjectStats: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const vols = await db.select().from(volumes)
        .where(and(eq(volumes.projectId, input.projectId), or(isNull(volumes.status), ne(volumes.status, 'deleted'))));
      const volIds = vols.map(v => v.id);
      let unitCount = 0;
      let chapterCount = 0;
      let draftCount = 0;
      let finalCount = 0;
      let totalWords = 0;
      let recentChapter: { id: string; title: string; updatedAt: Date | null } | null = null;
      let firstChapter: { id: string; title: string } | null = null;
      let firstUnfinished: { id: string; title: string } | null = null;

      if (volIds.length > 0) {
        for (const volId of volIds) {
          const unitList = await db.select().from(units)
            .where(and(eq(units.volumeId, volId), or(isNull(units.status), ne(units.status, 'deleted'))));
          unitCount += unitList.length;
          for (const unit of unitList) {
            const chList = await db.select().from(chapters)
              .where(and(eq(chapters.unitId, unit.id), or(isNull(chapters.status), ne(chapters.status, 'deleted'))));
            chapterCount += chList.length;
            for (const ch of chList) {
              if (ch.status === 'final') finalCount++;
              else if (ch.status === 'draft') draftCount++;
              // Get latest version word count
              const [latestVer] = await db.select({ wordCount: chapterVersions.wordCount })
                .from(chapterVersions).where(eq(chapterVersions.chapterId, ch.id))
                .orderBy(desc(chapterVersions.versionNumber)).limit(1);
              if (latestVer) totalWords += latestVer.wordCount ?? 0;
              // Track most recently updated chapter
              if (!recentChapter || (ch.updatedAt && (!recentChapter.updatedAt || ch.updatedAt > recentChapter.updatedAt))) {
                recentChapter = { id: ch.id, title: ch.title, updatedAt: ch.updatedAt };
              }
              // Track first chapter (first volume → first unit → first chapter by sort order)
              if (!firstChapter) {
                firstChapter = { id: ch.id, title: ch.title };
              }
              // Track first unfinished chapter (not 'final')
              if (!firstUnfinished && ch.status !== 'final') {
                firstUnfinished = { id: ch.id, title: ch.title };
              }
            }
          }
        }
      }

      const settingCount = await db.select({ count: sql<number>`count(*)::int` })
        .from(settings).where(eq(settings.projectId, input.projectId));

      return {
        volumeCount: vols.length,
        unitCount,
        chapterCount,
        draftCount,
        finalCount,
        totalWords,
        settingCount: settingCount[0]?.count ?? 0,
        recentChapter,
        firstChapter,
        firstUnfinished,
      };
    }),

  // 列出项目所有章节（跨所有卷/单元）— 用于模板导入
  listProjectChapters: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const vols = await db.select({ id: volumes.id }).from(volumes).where(eq(volumes.projectId, input.projectId));
      if (vols.length === 0) return [];
      const volIds = vols.map(v => v.id);
      const allUnits = await db.select({ id: units.id }).from(units).where(inArray(units.volumeId, volIds));
      if (allUnits.length === 0) return [];
      const unitIds = allUnits.map(u => u.id);
      return db.select({
        id: chapters.id,
        title: chapters.title,
        unitId: chapters.unitId,
        sortOrder: chapters.sortOrder,
        status: chapters.status,
      }).from(chapters)
        .where(and(inArray(chapters.unitId, unitIds), or(isNull(chapters.status), ne(chapters.status, 'deleted'))))
        .orderBy(asc(chapters.sortOrder));
    }),

  // 列出项目所有 AI 角色 — 用于模板导入
  listProjectAiRoles: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      return db.select().from(aiRoles)
        .where(eq(aiRoles.projectId, input.projectId))
        .orderBy(asc(aiRoles.createdAt));
    }),

  // ========== 修改日志 ==========
  saveEditLog: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      entityType: z.enum(['volume', 'unit', 'chapter', 'setting']),
      entityId: z.string().uuid(),
      fieldName: z.string().max(50),
      oldValue: z.string().optional(),
      newValue: z.string().optional(),
      editReason: z.string().optional(),
      aiRole: z.string().max(50).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [log] = await db.insert(editLogs).values({
        projectId: input.projectId,
        entityType: input.entityType,
        entityId: input.entityId as any,
        fieldName: input.fieldName,
        oldValue: input.oldValue || null,
        newValue: input.newValue || null,
        editReason: input.editReason || null,
        aiRole: input.aiRole || null,
      }).returning();
      return log;
    }),

  listEditLogs: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      entityType: z.enum(['volume', 'unit', 'chapter', 'setting']).optional(),
      entityId: z.string().uuid().optional(),
      limit: z.number().default(10),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const conditions = [eq(editLogs.projectId, input.projectId)];
      if (input.entityType) conditions.push(eq(editLogs.entityType, input.entityType));
      if (input.entityId) conditions.push(eq(editLogs.entityId, input.entityId as any));
      return db.select().from(editLogs)
        .where(and(...conditions))
        .orderBy(desc(editLogs.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // ========== 文档导入 ==========
  parseDocument: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      fileBase64: z.string(),
      fileName: z.string(),
      fileType: z.enum(['docx', 'pdf']),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);

      const buffer = Buffer.from(input.fileBase64, 'base64');
      const MAX_SIZE = 10 * 1024 * 1024; // 10MB
      if (buffer.length > MAX_SIZE) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '文件大小不能超过 10MB' });
      }

      let text = '';
      if (input.fileType === 'pdf') {
        const { default: pdfParse } = await import('pdf-parse') as any;
        const pdfData = await pdfParse(buffer);
        text = pdfData.text;
      } else {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      }

      if (!text.trim()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '文档内容为空，无法解析' });
      }

      // 截断到 50K 字符（AI 上下文限制）
      const MAX_CHARS = 50000;
      const originalLength = text.length;
      const truncated = text.length > MAX_CHARS;
      text = text.slice(0, MAX_CHARS);

      return { text, truncated, originalLength };
    }),

  // ========== 写作风格 ==========

  // 获取写作风格
  getWritingStyle: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [project] = await db.select({ writingStyle: projects.writingStyle })
        .from(projects)
        .where(eq(projects.id, input.projectId));
      return project?.writingStyle || {};
    }),

  // 保存写作风格
  saveWritingStyle: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      writingStyle: z.record(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      await db.update(projects)
        .set({ writingStyle: input.writingStyle, updatedAt: new Date() })
        .where(eq(projects.id, input.projectId));
      return { ok: true };
    }),
});