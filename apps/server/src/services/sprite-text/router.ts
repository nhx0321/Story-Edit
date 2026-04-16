import { z } from 'zod';
import { router, adminProcedure } from '../../trpc';
import * as service from './service';

export const spriteTextRouter = router({
  // 同步：从 manifest 扫描可用的精灵角色/等级
  syncEntries: adminProcedure.mutation(async () => {
    return service.syncFromManifest();
  }),

  // 查询：某精灵的文本条目列表
  listEntries: adminProcedure
    .input(z.object({
      species: z.string(),
      variant: z.string(),
    }))
    .query(async ({ input }) => {
      return service.listEntries(input.species, input.variant);
    }),

  // 创建文本条目
  createEntry: adminProcedure
    .input(service.createEntrySchema)
    .mutation(async ({ input }) => {
      return service.createEntry(input);
    }),

  // 更新文本条目
  updateEntry: adminProcedure
    .input(service.updateEntrySchema)
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      return service.updateEntry(id, updates);
    }),

  // 删除文本条目
  deleteEntry: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return service.deleteEntry(input.id);
    }),

  // 上线
  publishEntry: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return service.publishEntry(input.id);
    }),

  // 取消上线
  unpublishEntry: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return service.unpublishEntry(input.id);
    }),

  // 模板：应用到全部等级
  applyToAllLevels: adminProcedure
    .input(z.object({ entryId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return service.applyToAllLevels(input.entryId);
    }),

  // AI：提交实现任务
  submitToAI: adminProcedure
    .input(z.object({ entryId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return service.submitToAI(input.entryId);
    }),

  // AI：重试失败任务
  retryFailedTask: adminProcedure
    .input(z.object({ entryId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return service.retryFailedTask(input.entryId);
    }),

  // 查询任务状态
  getTaskStatus: adminProcedure
    .input(z.object({ entryId: z.string().uuid() }))
    .query(async ({ input }) => {
      return service.getTaskStatus(input.entryId);
    }),
});
