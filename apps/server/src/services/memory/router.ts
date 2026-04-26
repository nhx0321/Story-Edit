// L0-L4 分级记忆服务
import { z } from 'zod';
import { eq, and, asc, desc } from 'drizzle-orm';
import { router, protectedProcedure, verifyProjectOwner } from '../../trpc';
import { db } from '../../db';
import { memoryEntries, foreshadows, inventoryItems, characterStates } from '../../db/schema';

/*
  记忆分级：
  L0 — 活跃记忆（高频准则，每次创作必加载）
  L1 — 卷级经验（当前卷的创作经验总结）
  L2 — 单元经验（单元完结时归纳）
  L3 — 逐章修改经验（每章定稿后沉淀）
  L4 — 归档（已过期的L3，按需检索）
*/

export const memoryRouter = router({
  // 获取项目记忆（按级别）
  list: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      level: z.enum(['L0', 'L1', 'L2', 'L3', 'L4']).optional(),
      activeOnly: z.boolean().default(true),
    }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const conditions = [eq(memoryEntries.projectId, input.projectId)];
      if (input.level) conditions.push(eq(memoryEntries.level, input.level));
      if (input.activeOnly) conditions.push(eq(memoryEntries.isActive, true));
      return db.select().from(memoryEntries).where(and(...conditions)).orderBy(asc(memoryEntries.level), asc(memoryEntries.createdAt));
    }),

  // 添加记忆条目
  add: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      level: z.enum(['L0', 'L1', 'L2', 'L3', 'L4']),
      category: z.string().optional(),
      content: z.string(),
      sourceChapterId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [entry] = await db.insert(memoryEntries).values(input).returning();
      return entry;
    }),

  // 合并或新增记忆条目（同 level+category 合并，自动计数晋升 L0）
  upsert: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      level: z.enum(['L0', 'L1', 'L2', 'L3', 'L4']),
      category: z.string().optional(),
      content: z.string(),
      sourceChapterId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);

      // 查询同 level+category 的现有记录
      const conditions = [
        eq(memoryEntries.projectId, input.projectId),
        eq(memoryEntries.level, input.level),
        eq(memoryEntries.isActive, true),
      ];
      if (input.category) conditions.push(eq(memoryEntries.category, input.category));

      const [existing] = await db.select()
        .from(memoryEntries)
        .where(and(...conditions))
        .limit(1);

      if (existing) {
        // 合并内容：旧内容 + 新内容（分隔线）
        const mergedContent = existing.content + '\n\n---\n' + input.content;
        const newCount = (existing.updateCount || 1) + 1;
        const shouldPromote = newCount >= 5 && existing.level !== 'L0';

        const [updated] = await db.update(memoryEntries)
          .set({
            content: mergedContent,
            updateCount: newCount,
            level: shouldPromote ? 'L0' : existing.level,
            updatedAt: new Date(),
          })
          .where(eq(memoryEntries.id, existing.id))
          .returning();
        return updated;
      } else {
        // 新增
        const [entry] = await db.insert(memoryEntries)
          .values({ ...input, updateCount: 1 })
          .returning();
        return entry;
      }
    }),

  // 升级记忆（L3→L2→L1→L0）
  promote: protectedProcedure
    .input(z.object({ id: z.string().uuid(), projectId: z.string().uuid(), targetLevel: z.enum(['L0', 'L1', 'L2']) }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [updated] = await db.update(memoryEntries)
        .set({ level: input.targetLevel, updatedAt: new Date() })
        .where(and(eq(memoryEntries.id, input.id), eq(memoryEntries.projectId, input.projectId))).returning();
      return updated;
    }),

  // 归档记忆（降级到L4）
  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid(), projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [updated] = await db.update(memoryEntries)
        .set({ level: 'L4', isActive: false, updatedAt: new Date() })
        .where(and(eq(memoryEntries.id, input.id), eq(memoryEntries.projectId, input.projectId))).returning();
      return updated;
    }),

  // ========== 伏笔追踪 ==========
  listForeshadows: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const conditions = [eq(foreshadows.projectId, input.projectId)];
      if (input.status) conditions.push(eq(foreshadows.status, input.status));
      return db.select().from(foreshadows).where(and(...conditions)).orderBy(asc(foreshadows.createdAt));
    }),

  addForeshadow: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      title: z.string(),
      description: z.string().optional(),
      plantedChapterId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [f] = await db.insert(foreshadows).values(input).returning();
      return f;
    }),

  resolveForeshadow: protectedProcedure
    .input(z.object({ id: z.string().uuid(), projectId: z.string().uuid(), resolvedChapterId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [updated] = await db.update(foreshadows)
        .set({ status: 'resolved', resolvedChapterId: input.resolvedChapterId })
        .where(and(eq(foreshadows.id, input.id), eq(foreshadows.projectId, input.projectId))).returning();
      return updated;
    }),

  // ========== 物资追踪 ==========
  listInventory: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      return db.select().from(inventoryItems).where(eq(inventoryItems.projectId, input.projectId));
    }),

  addInventoryItem: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      characterId: z.string().optional(),
      name: z.string(),
      quantity: z.number().default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [item] = await db.insert(inventoryItems).values(input).returning();
      return item;
    }),

  // ========== 角色状态 ==========
  getCharacterState: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), characterName: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [state] = await db.select().from(characterStates)
        .where(and(eq(characterStates.projectId, input.projectId), eq(characterStates.characterName, input.characterName)))
        .orderBy(desc(characterStates.createdAt))
        .limit(1);
      return state;
    }),

  saveCharacterState: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      characterName: z.string(),
      chapterId: z.string().uuid().optional(),
      state: z.record(z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const [s] = await db.insert(characterStates).values(input).returning();
      return s;
    }),
});
