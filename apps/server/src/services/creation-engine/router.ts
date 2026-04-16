// 创作引擎 tRPC 路由
import { z } from 'zod';
import { router, protectedProcedure, verifyProjectOwner } from '../../trpc';
import { getDefaultWorkflow } from './workflow';
import { taskBriefToMessages, estimateTokens } from './task-brief';
import { resolveRole } from './role-dispatcher';
import type { TaskBrief } from './task-brief';

export const creationRouter = router({
  // 获取项目工作流定义
  getWorkflow: protectedProcedure
    .input(z.object({ projectType: z.string().default('novel') }))
    .query(({ input }) => {
      return getDefaultWorkflow(input.projectType);
    }),

  // 生成任务书
  generateTaskBrief: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      chapterId: z.string().uuid(),
      chapterTitle: z.string(),
      chapterSynopsis: z.string(),
      previousSummary: z.string().default(''),
      lastParagraph: z.string().default(''),
      relevantSettings: z.array(z.string()).default([]),
      characterStates: z.array(z.string()).default([]),
      redLines: z.array(z.string()).default([]),
      styleGuide: z.string().default(''),
      isPremium: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);

      const brief: TaskBrief = {
        chapterId: input.chapterId,
        chapterTitle: input.chapterTitle,
        previousSummary: input.previousSummary,
        chapterSynopsis: input.chapterSynopsis,
        relevantSettings: input.relevantSettings,
        characterStates: input.characterStates,
        redLines: input.redLines,
        styleGuide: input.styleGuide,
        lastParagraph: input.lastParagraph,
      };

      const role = await resolveRole(input.projectId, 'writer');
      const messages = taskBriefToMessages(brief, role.systemPrompt, {
        isPremium: input.isPremium,
        includeRedLines: input.isPremium,
        includeStateSnapshot: input.isPremium,
      });

      const estimatedTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

      return { brief, messages, role, estimatedTokens };
    }),

  // 获取角色信息
  getRole: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), roleKey: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      return resolveRole(input.projectId, input.roleKey);
    }),
});
