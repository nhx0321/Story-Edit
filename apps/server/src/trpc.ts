import { initTRPC, TRPCError } from '@trpc/server';
import { eq, and, ne, or, isNull } from 'drizzle-orm';
import { db } from './db';
import { projects, users } from './db/schema';

// 使用通用 context，不依赖 Fastify 类型
export interface Context {
  userId?: string;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

// 共享鉴权中间件 — 所有需要登录的路由统一使用
const authed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: '未登录' });
  return next({ ctx: { userId: ctx.userId } });
});
export const protectedProcedure = t.procedure.use(authed);

// 管理员中间件 — 检查用户是否为管理员
const admin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: '未登录' });
  const [user] = await db.select({ isAdmin: users.isAdmin, adminLevel: users.adminLevel })
    .from(users).where(eq(users.id, ctx.userId));
  if (!user?.isAdmin) throw new TRPCError({ code: 'FORBIDDEN', message: '需要管理员权限' });
  // Update last active time for online tracking
  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, ctx.userId));
  return next({ ctx: { userId: ctx.userId, adminLevel: user.adminLevel } });
});
export const adminProcedure = t.procedure.use(admin);

// 按级别的管理员中间件工厂 — 仅允许指定级别及以上的管理员
export function adminProcedureLevel(minLevel: number) {
  return t.procedure.use(t.middleware(async ({ ctx, next }) => {
    if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: '未登录' });
    const [user] = await db.select({ isAdmin: users.isAdmin, adminLevel: users.adminLevel })
      .from(users).where(eq(users.id, ctx.userId));
    if (!user?.isAdmin) throw new TRPCError({ code: 'FORBIDDEN', message: '需要管理员权限' });
    if (user.adminLevel === null || user.adminLevel > minLevel) {
      throw new TRPCError({ code: 'FORBIDDEN', message: '管理级别不足' });
    }
    return next({ ctx: { userId: ctx.userId, adminLevel: user.adminLevel } });
  }));
}

// 验证项目归属 — 确保当前用户拥有该项目且未被删除
export async function verifyProjectOwner(projectId: string, userId: string) {
  const [project] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId), or(isNull(projects.status), ne(projects.status, 'deleted'))));
  if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: '项目不存在' });
  return project;
}
