// AI 配置管理 + 网关 tRPC 路由
import { z } from 'zod';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../trpc';
import { db } from '../../db';
import { aiConfigs, aiUsageLogs } from '../../db/schema';
import { encryptApiKey, decryptApiKey } from './crypto';
import { createAdapter } from '@story-edit/ai-adapters';
import type { AIMessage } from '@story-edit/ai-adapters';


export const aiRouter = router({
  // 保存 AI 配置
  saveConfig: protectedProcedure
    .input(z.object({
      provider: z.enum(['deepseek', 'longcat', 'qwen', 'custom']),
      name: z.string().min(1),
      apiKey: z.string().min(1),
      baseUrl: z.string().optional(),
      defaultModel: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const encrypted = encryptApiKey(input.apiKey);
      const [config] = await db.insert(aiConfigs).values({
        userId: ctx.userId,
        provider: input.provider,
        name: input.name,
        apiKey: encrypted,
        baseUrl: input.baseUrl,
        defaultModel: input.defaultModel,
      }).returning();
      return { id: config!.id, provider: config!.provider, name: config!.name };
    }),

  // 获取用户所有 AI 配置（不返回明文 key）
  listConfigs: protectedProcedure.query(async ({ ctx }) => {
    const configs = await db.select({
      id: aiConfigs.id,
      provider: aiConfigs.provider,
      name: aiConfigs.name,
      baseUrl: aiConfigs.baseUrl,
      defaultModel: aiConfigs.defaultModel,
      isActive: aiConfigs.isActive,
      createdAt: aiConfigs.createdAt,
    }).from(aiConfigs).where(eq(aiConfigs.userId, ctx.userId));
    return configs;
  }),

  // 删除 AI 配置
  deleteConfig: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(aiConfigs).where(
        and(eq(aiConfigs.id, input.id), eq(aiConfigs.userId, ctx.userId)),
      );
      return { ok: true };
    }),

  // 测试连接
  testConnection: protectedProcedure
    .input(z.object({ configId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [config] = await db.select().from(aiConfigs).where(
        and(eq(aiConfigs.id, input.configId), eq(aiConfigs.userId, ctx.userId)),
      );
      if (!config) throw new TRPCError({ code: 'NOT_FOUND', message: '配置不存在' });

      const apiKey = decryptApiKey(config.apiKey);

      const adapter = createAdapter(config.provider, {
        apiKey,
        baseUrl: config.baseUrl || undefined,
        defaultModel: config.defaultModel || undefined,
      });
      return adapter.testConnection();
    }),

  // 发送聊天（非流式）
  chat: protectedProcedure
    .input(z.object({
      configId: z.string().uuid(),
      messages: z.array(z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string(),
      })),
      projectId: z.string().uuid().optional(),
      model: z.string().optional(),
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [config] = await db.select().from(aiConfigs).where(
        and(eq(aiConfigs.id, input.configId), eq(aiConfigs.userId, ctx.userId)),
      );
      if (!config) throw new TRPCError({ code: 'NOT_FOUND', message: '配置不存在' });

      const apiKey = decryptApiKey(config.apiKey);
      const adapter = createAdapter(config.provider, {
        apiKey,
        baseUrl: config.baseUrl || undefined,
        defaultModel: config.defaultModel || undefined,
      });

      const result = await adapter.chat(input.messages as AIMessage[], {
        model: input.model,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      });

      if (result.usage) {
        await db.insert(aiUsageLogs).values({
          userId: ctx.userId,
          projectId: input.projectId,
          provider: config.provider,
          model: input.model || config.defaultModel || 'unknown',
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
        });
      }

      return result;
    }),

  // 用量统计
  usageStats: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(90).default(30),
      projectId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const since = new Date();
      since.setDate(since.getDate() - input.days);

      const conditions = [
        eq(aiUsageLogs.userId, ctx.userId),
        gte(aiUsageLogs.createdAt, since),
      ];
      if (input.projectId) {
        conditions.push(eq(aiUsageLogs.projectId, input.projectId));
      }

      const stats = await db.select({
        provider: aiUsageLogs.provider,
        model: aiUsageLogs.model,
        totalPromptTokens: sql<number>`sum(${aiUsageLogs.promptTokens})::int`,
        totalCompletionTokens: sql<number>`sum(${aiUsageLogs.completionTokens})::int`,
        totalTokens: sql<number>`sum(${aiUsageLogs.totalTokens})::int`,
        callCount: sql<number>`count(*)::int`,
      })
        .from(aiUsageLogs)
        .where(and(...conditions))
        .groupBy(aiUsageLogs.provider, aiUsageLogs.model);

      const daily = await db.select({
        date: sql<string>`date(${aiUsageLogs.createdAt})`,
        totalTokens: sql<number>`sum(${aiUsageLogs.totalTokens})::int`,
        callCount: sql<number>`count(*)::int`,
      })
        .from(aiUsageLogs)
        .where(and(...conditions))
        .groupBy(sql`date(${aiUsageLogs.createdAt})`)
        .orderBy(sql`date(${aiUsageLogs.createdAt})`);

      return { byModel: stats, daily };
    }),
});
