// 用户迁移 tRPC 路由
import { z } from 'zod';
import { router, adminProcedure, adminProcedureLevel } from '../../trpc';
import * as migration from './migrate';

export const migrationRouter = router({
  // 历史迁移统计（仅管理员可见）
  getStats: adminProcedure.query(async () => {
    return migration.getMigrationStats();
  }),

  // 历史迁移工具（仅最高管理员可执行）
  migrateUser: adminProcedureLevel(0)
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return migration.migrateUser(input.userId);
    }),

  migrateAll: adminProcedureLevel(0).mutation(async () => {
    return migration.migrateAllUsers();
  }),
});
