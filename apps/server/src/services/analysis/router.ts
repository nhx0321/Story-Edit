// AI分析持久化 tRPC Router
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, verifyProjectOwner } from '../../trpc';
import { db } from '../../db';
import { chapterAnalysis, userTokenAccounts, modelPricing, chapterVersions } from '../../db/schema';
import { createAdapter } from '@story-edit/ai-adapters';
import type { AIMessage } from '@story-edit/ai-adapters';
import * as tokenBilling from '../token-relay/token-billing';
import * as channelManager from '../token-relay/channel-manager';
import * as pricingService from '../token-relay/model-pricing';
import * as consumptionTracker from '../token-relay/consumption-tracker';

// ========== 工具函数 ==========

const ANALYSIS_TYPE_LABELS: Record<string, string> = {
  self_check: 'AI自检',
  l0_l4_summary: '经验总结(L0-L4)',
  modification: 'AI修改',
};

const CHUNK_UPDATE_INTERVAL = 10; // 每 10 个 chunk 更新一次 DB
const MAX_CONCURRENT_PER_PROJECT = 3;

/** 判断是否为 thinking/reasoning 模型 */
function isThinkingModel(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.includes('reasoner') || lower.includes('thinking') || lower.includes('think');
}

/** 从完整 model 字符串中提取纯 modelId（去掉 provider/ 前缀） */
function extractModelId(model: string): string {
  const slashIdx = model.indexOf('/');
  if (slashIdx > 0) {
    const prefix = model.substring(0, slashIdx).toLowerCase();
    if (['deepseek', 'claude', 'anthropic', 'gpt', 'o1', 'o3', 'longcat', 'qwen', 'openai'].includes(prefix)) {
      return model.substring(slashIdx + 1);
    }
  }
  return model;
}

/**
 * 从模型名称获取提供商
 */
function getProviderFromModel(model: string): string {
  if (model.startsWith('deepseek')) return 'deepseek';
  if (model.startsWith('claude') || model.startsWith('anthropic')) return 'anthropic';
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('LongCat') || model.toLowerCase().includes('longcat')) return 'longcat';
  if (model.startsWith('qwen')) return 'qwen';
  return 'deepseek';
}

/**
 * 估算输入 Token 数
 */
function estimateInputTokens(messages: AIMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    total += Math.ceil(text.length / 2);
  }
  return Math.max(total, 100);
}

/**
 * 获取用户的推荐模型
 */
async function getUserModel(userId: string): Promise<string> {
  const [account] = await db.select({ preferredModel: userTokenAccounts.preferredModel })
    .from(userTokenAccounts)
    .where(eq(userTokenAccounts.userId, userId));
  return account?.preferredModel || 'deepseek-chat';
}

// ========== 后台 AI 流式执行 ==========

async function runBackgroundAnalysis(
  analysisId: string,
  userId: string,
  projectId: string,
  messages: AIMessage[],
  model: string,
) {
  let estimatedCost = 0;
  let channelId: string | null = null;

  try {
    // 1. 更新状态为 processing
    await db.update(chapterAnalysis)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(chapterAnalysis.id, analysisId));

    // 2. 获取模型定价（去掉 provider/ 前缀以匹配 modelPricing 表）
    const provider = getProviderFromModel(model);
    const modelId = extractModelId(model);
    const pricing = await pricingService.getModelPricing(provider, modelId);
    if (!pricing) throw new Error(`模型 ${model} 暂无定价信息`);

    // 3. 确保 Token 账户存在
    await tokenBilling.ensureAccount(userId);

    // 4. 估算费用并预扣
    const estimatedInputTokens = estimateInputTokens(messages);
    const estimatedOutputTokens = 4096;
    const costInfo = tokenBilling.estimateCost(
      pricing.inputPricePer1m,
      pricing.outputPricePer1m,
      estimatedInputTokens,
      estimatedOutputTokens,
    );
    estimatedCost = costInfo.estimatedCost;

    const hasBalance = await tokenBilling.checkBalance(userId, estimatedCost);
    if (!hasBalance) throw new Error('Token余额不足');

    const preDeductResult = await tokenBilling.preDeduct(userId, estimatedCost);
    if (!preDeductResult.success) throw new Error(preDeductResult.error || '余额不足');

    // 5. 选择上游渠道
    const account = await tokenBilling.getAccount(userId);
    const userTier = account && (account.balance ?? 0) > 0 ? 'vip' : 'free';
    const channel = await channelManager.selectChannel(provider, userTier, { excludeIds: [] });
    if (!channel) throw new Error('暂无可用AI渠道，请稍后重试');
    channelId = channel.id;

    // 6. 解密渠道 API Key
    const { decryptApiKey } = await import('../ai-gateway/crypto');
    const channelApiKey = decryptApiKey(channel.apiKeyEncrypted);

    // 7. 创建适配器并流式调用
    const adapter = createAdapter(provider, {
      apiKey: channelApiKey,
      baseUrl: channel.baseUrl || undefined,
      defaultModel: modelId,
    });

    let fullResult = '';
    let chunkCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const stream = adapter.chatStream(messages, { model: modelId });
    for await (const chunk of stream) {
      if (chunk.done) {
        if (chunk.usage) {
          totalInputTokens = chunk.usage.promptTokens;
          totalOutputTokens = chunk.usage.completionTokens;
        }
      } else {
        // 只累加 content，丢弃 thinking（思考型模型的内部推理不应输出）
        fullResult += chunk.content || '';
        chunkCount++;

        // 每 N 个 chunk 更新一次 DB
        if (chunkCount % CHUNK_UPDATE_INTERVAL === 0) {
          const progress = Math.min(Math.floor((fullResult.length / (fullResult.length + 1000)) * 100), 99);
          await db.update(chapterAnalysis)
            .set({
              result: fullResult,
              progress,
              updatedAt: new Date(),
            })
            .where(eq(chapterAnalysis.id, analysisId));
        }
      }
    }

    // 8. 更新为完成状态
    await db.update(chapterAnalysis)
      .set({
        status: 'completed',
        result: fullResult,
        progress: 100,
        updatedAt: new Date(),
      })
      .where(eq(chapterAnalysis.id, analysisId));

    // 9. 精确结算
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      const { finalCost } = await tokenBilling.finalizeCharge(
        userId, estimatedCost,
        { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
        pricing.inputPricePer1m, pricing.outputPricePer1m,
      );
      await channelManager.recordChannelUsage(channel.id, totalInputTokens + totalOutputTokens);
      await consumptionTracker.recordConsumption({
        userId,
        source: 'in_app',
        channelId: channel.id,
        provider,
        modelId,
        requestType: 'chat',
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cost: finalCost,
        projectId,
      });
    } else {
      await tokenBilling.refundIntent(userId, estimatedCost);
    }
  } catch (err: unknown) {
    // 失败：更新状态 + 退款
    const errorMessage = err instanceof Error ? err.message : '分析任务失败';
    await db.update(chapterAnalysis)
      .set({
        status: 'failed',
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(chapterAnalysis.id, analysisId));

    if (estimatedCost > 0) {
      await tokenBilling.refundIntent(userId, estimatedCost).catch(() => {});
    }
    if (channelId) {
      await channelManager.markChannelError(channelId, errorMessage).catch(() => {});
    }
  }
}

// ========== Prompt 构建 ==========

function buildSelfCheckPrompt(editorContent: string): AIMessage[] {
  const systemMsg: AIMessage = {
    role: 'system',
    content: '你是一名专业的文学编辑。请对小说正文进行全面的自检，找出需要修改的问题。输出格式清晰的自检报告，每项包含：原因、原文、修改建议。注意：报告中不要包含任何签名或署名（如"审核员签名"等），直接输出修改建议内容。',
  };
  const userMsg: AIMessage = {
    role: 'user',
    content: `请对以下正文进行自检：\n\n${editorContent.slice(0, 8000)}`,
  };
  return [systemMsg, userMsg];
}

function buildL0L4Prompts(editorContent: string, chapterTitle: string, draftContent?: string): Array<{ level: string; messages: AIMessage[] }> {
  return [
    {
      level: 'L0',
      messages: [
        { role: 'system', content: '你是一名资深文学编辑，负责从已完成的章节中提取可作为"创作铁律"的核心经验。请按以下分类输出分析结果：【故事核心要素】【世界规则】【角色成长弧】【风格指南】' },
        { role: 'user', content: `分析以下章节正文，提取可作为创作铁律的内容：\n\n${editorContent.slice(0, 5000)}` },
      ],
    },
    {
      level: 'L1',
      messages: [
        { role: 'system', content: '你是一名专业文学编辑，负责分析章节中使用的写作技巧。请按以下分类输出：【写作技巧】【节奏经验】【对话心得】' },
        { role: 'user', content: `分析以下章节正文，总结其写作技巧和经验：\n\n${editorContent.slice(0, 5000)}` },
      ],
    },
    {
      level: 'L2',
      messages: [
        { role: 'system', content: '你是一名资深文学编辑，负责从已完成章节中提炼写作经验。请按以下分类输出：【写作收获】本章写得好的地方和可复用的技法 【改进方向】本章的不足和下次可改进之处 【注意事项】创作中需要持续关注的要点' },
        { role: 'user', content: `分析以下章节正文，提炼写作经验总结：\n\n${editorContent.slice(0, 5000)}` },
      ],
    },
    {
      level: 'L3',
      messages: [
        { role: 'system', content: '你是一名专业数据提取员和伏笔跟踪员。请从章节中提取两类信息：一、关键数据（具体数值、武力等级、法宝名称等），标注其在故事中的作用；二、伏笔线索，按以下分类输出：【伏笔设置】【悬念钩子】【待回收线索】' },
        { role: 'user', content: `从以下章节正文中提取数值数据和伏笔线索：\n\n${editorContent.slice(0, 6000)}` },
      ],
    },
    {
      level: 'L4',
      messages: draftContent
        ? [
            { role: 'system', content: '你是一名资深文学编辑。请对比草稿和定稿的差异，完成以下任务：\n1. 【修改意图】提炼作者从草稿到定稿的修改意图（如加强节奏、深化人物、删减冗余等），每条一句话，3-5条\n2. 【具体改动】列出关键改动点（增/删/改），每条一句话，3-5条\n3. 【写作优劣】基于定稿列出优点和不足各2-3条\n不要重复原文，不要写长段分析。' },
            { role: 'user', content: `【草稿】\n${draftContent.slice(0, 4000)}\n\n【定稿】\n${editorContent.slice(0, 4000)}` },
          ]
        : [
            { role: 'system', content: '你是一名资深文学编辑。请用简洁的要点形式，列出本章写作的优点和不足（各3-5条），每条一句话。不要写长段分析，不要重复原文。' },
            { role: 'user', content: `对以下已定稿章节进行写作质量点评：\n\n${editorContent.slice(0, 6000)}` },
          ],
    },
  ];
}

// ========== Router ==========

export const analysisRouter = router({
  /** 发起分析任务 */
  start: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      chapterId: z.string().uuid(),
      type: z.enum(['self_check', 'l0_l4_summary', 'modification']),
      editorContent: z.string().optional(),
      chapterTitle: z.string().optional(),
      model: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);

      // 检查并发限制
      const [pendingCount] = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(chapterAnalysis)
        .where(and(
          eq(chapterAnalysis.projectId, input.projectId),
          eq(chapterAnalysis.status, 'processing'),
        ));

      if (pendingCount && pendingCount.count >= MAX_CONCURRENT_PER_PROJECT) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `每个项目最多同时进行 ${MAX_CONCURRENT_PER_PROJECT} 个分析任务`,
        });
      }

      // 获取模型
      const model = input.model || await getUserModel(ctx.userId);
      const isThinking = isThinkingModel(model);

      // 创建 DB 记录（含模型信息）
      const [record] = await db.insert(chapterAnalysis).values({
        projectId: input.projectId,
        chapterId: input.chapterId,
        userId: ctx.userId,
        type: input.type,
        status: 'pending',
        metadata: { model, isThinking },
      }).returning();

      // 后台启动 AI 流式（不阻塞响应）
      if (input.type === 'self_check' && input.editorContent) {
        const messages = buildSelfCheckPrompt(input.editorContent);
        void runBackgroundAnalysis(record.id, ctx.userId, input.projectId, messages, model);
      } else if (input.type === 'l0_l4_summary' && input.editorContent) {
        // L0-L4 并行 AI 调用，公共初始化只执行 1 次
        const editorContent = input.editorContent;
        const chapterTitle = input.chapterTitle || '';

        // 查询最近的草稿版本（用于 L4 对比）
        const [latestDraft] = await db.select({ content: chapterVersions.content })
          .from(chapterVersions)
          .where(and(
            eq(chapterVersions.chapterId, input.chapterId),
            eq(chapterVersions.versionType, 'draft'),
          ))
          .orderBy(desc(chapterVersions.versionNumber))
          .limit(1);
        const draftContent = latestDraft?.content;

        void (async () => {
          let totalPreDeducted = 0;
          try {
            console.log(`[L0-L4] Starting parallel analysis for record ${record.id}`);

            // 立即设置状态为 processing
            await db.update(chapterAnalysis)
              .set({
                status: 'processing',
                progress: 0,
                metadata: { model, isThinking, mode: 'parallel', completed_levels: [] as string[] },
                updatedAt: new Date(),
              })
              .where(eq(chapterAnalysis.id, record.id));

            const levels = buildL0L4Prompts(editorContent, chapterTitle, draftContent);
            console.log(`[L0-L4] Built ${levels.length} level prompts, starting parallel execution`);

            // === 公共初始化（只 1 次）===
            const provider = getProviderFromModel(model);
            const modelId = extractModelId(model);
            const pricing = await pricingService.getModelPricing(provider, modelId);
            if (!pricing) throw new Error(`模型 ${model} 暂无定价信息`);

            await tokenBilling.ensureAccount(ctx.userId);

            // 合并估算 5 轮总费用，一次性预扣
            let totalEstimatedCost = 0;
            for (const levelData of levels) {
              const estInput = estimateInputTokens(levelData.messages);
              const costInfo = tokenBilling.estimateCost(
                pricing.inputPricePer1m, pricing.outputPricePer1m,
                estInput, 4096,
              );
              totalEstimatedCost += costInfo.estimatedCost;
            }

            const hasBalance = await tokenBilling.checkBalance(ctx.userId, totalEstimatedCost);
            if (!hasBalance) throw new Error('Token余额不足');

            const preDeduct = await tokenBilling.preDeduct(ctx.userId, totalEstimatedCost);
            if (!preDeduct.success) throw new Error(preDeduct.error || '余额不足');
            totalPreDeducted = totalEstimatedCost;

            const account = await tokenBilling.getAccount(ctx.userId);
            const userTier = account && (account.balance ?? 0) > 0 ? 'vip' : 'free';
            const channel = await channelManager.selectChannel(provider, userTier, { excludeIds: [] });
            if (!channel) throw new Error('暂无可用AI渠道，请稍后重试');

            console.log(`[L0-L4] Common init done, channel ${channel.id}, preDeducted ${totalEstimatedCost}`);

            const { decryptApiKey } = await import('../ai-gateway/crypto');
            const channelApiKey = decryptApiKey(channel.apiKeyEncrypted);
            const adapter = createAdapter(provider, {
              apiKey: channelApiKey,
              baseUrl: channel.baseUrl || undefined,
              defaultModel: modelId,
            });

            // === 并行执行 5 轮 AI 流式调用 ===
            const completedLevels: string[] = [];
            const results = await Promise.allSettled(levels.map(async (levelData) => {
              console.log(`[L0-L4] ${levelData.level} - Starting AI stream`);
              let levelResult = '';
              let inputTokens = 0;
              let outputTokens = 0;

              const stream = adapter.chatStream(levelData.messages, { model: modelId });
              for await (const chunk of stream) {
                if (chunk.done && chunk.usage) {
                  inputTokens = chunk.usage.promptTokens;
                  outputTokens = chunk.usage.completionTokens;
                } else {
                  levelResult += chunk.content || '';
                }
              }

              console.log(`[L0-L4] ${levelData.level} - Done, tokens: ${inputTokens}/${outputTokens}, result: ${levelResult.length} chars`);

              // 更新进度（每完成 1 轮 +20%）
              completedLevels.push(levelData.level);
              const progress = Math.min(completedLevels.length * 20, 99);
              await db.update(chapterAnalysis)
                .set({
                  progress,
                  metadata: sql`jsonb_set(jsonb_set(metadata, '{completed_levels}', ${JSON.stringify(completedLevels)}::jsonb, true), '{progress_count}', to_jsonb(${completedLevels.length}::int), true)`,
                  updatedAt: new Date(),
                })
                .where(eq(chapterAnalysis.id, record.id));

              return { level: levelData.level, result: levelResult, inputTokens, outputTokens };
            }));

            // === 合并结果（保持 L0→L4 顺序）===
            let combinedResult = '';
            let totalInputTokens = 0;
            let totalOutputTokens = 0;

            for (let i = 0; i < levels.length; i++) {
              const r = results[i];
              if (r.status === 'fulfilled') {
                combinedResult += `\n\n【${r.value.level}分析结果】\n${r.value.result}`;
                totalInputTokens += r.value.inputTokens;
                totalOutputTokens += r.value.outputTokens;
              } else {
                const errMsg = r.reason instanceof Error ? r.reason.message : '未知错误';
                console.error(`[L0-L4] ${levels[i].level} failed:`, r.reason);
                combinedResult += `\n\n【${levels[i].level}】分析异常：${errMsg}`;
              }
            }

            // === 完成：更新 DB ===
            await db.update(chapterAnalysis)
              .set({
                status: 'completed',
                result: combinedResult,
                progress: 100,
                metadata: sql`jsonb_set(metadata, '{current_level}', '"done"', true)`,
                updatedAt: new Date(),
              })
              .where(eq(chapterAnalysis.id, record.id));
            console.log(`[L0-L4] All levels completed for record ${record.id}`);

            // === 一次性精确结算 ===
            if (totalInputTokens > 0 || totalOutputTokens > 0) {
              const { finalCost } = await tokenBilling.finalizeCharge(
                ctx.userId, totalPreDeducted,
                { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
                pricing.inputPricePer1m, pricing.outputPricePer1m,
              );
              await channelManager.recordChannelUsage(channel.id, totalInputTokens + totalOutputTokens);
              await consumptionTracker.recordConsumption({
                userId: ctx.userId, source: 'in_app', channelId: channel.id, provider, modelId,
                requestType: 'chat', inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens, cost: finalCost, projectId: input.projectId,
              });
            } else {
              await tokenBilling.refundIntent(ctx.userId, totalPreDeducted);
            }
          } catch (err) {
            console.error(`[L0-L4] Fatal error for record ${record.id}:`, err);
            await db.update(chapterAnalysis)
              .set({
                status: 'failed',
                result: `分析失败：${err instanceof Error ? err.message : '未知错误'}`,
                updatedAt: new Date(),
              })
              .where(eq(chapterAnalysis.id, record.id));
            if (totalPreDeducted > 0) {
              await tokenBilling.refundIntent(ctx.userId, totalPreDeducted).catch(() => {});
            }
          }
        })();
      } else {
        // modification 或其他类型
        void runBackgroundAnalysis(
          record.id,
          ctx.userId,
          input.projectId,
          [{ role: 'user' as const, content: '分析任务' }],
          model,
        );
      }

      return { analysisId: record.id, model, isThinking };
    }),

  /** 获取分析状态 */
  getStatus: protectedProcedure
    .input(z.object({
      analysisId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      const [record] = await db.select().from(chapterAnalysis)
        .where(eq(chapterAnalysis.id, input.analysisId));

      if (!record) throw new TRPCError({ code: 'NOT_FOUND', message: '分析任务不存在' });

      return {
        id: record.id,
        type: record.type,
        status: record.status,
        result: record.result,
        progress: record.progress,
        errorMessage: record.errorMessage,
        dismissed: record.dismissed,
        metadata: record.metadata,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    }),

  /** 查询项目的所有分析记录 */
  listByProject: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      limit: z.number().default(20),
    }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);

      const records = await db.select().from(chapterAnalysis)
        .where(and(
          eq(chapterAnalysis.projectId, input.projectId),
          eq(chapterAnalysis.userId, ctx.userId),
        ))
        .orderBy(desc(chapterAnalysis.createdAt))
        .limit(input.limit);

      return records;
    }),

  /** 查询章节的所有分析记录 */
  listByChapter: protectedProcedure
    .input(z.object({
      chapterId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      const records = await db.select().from(chapterAnalysis)
        .where(eq(chapterAnalysis.chapterId, input.chapterId))
        .orderBy(desc(chapterAnalysis.createdAt));

      return records;
    }),

  /** 重试失败的分析 */
  retry: protectedProcedure
    .input(z.object({
      analysisId: z.string().uuid(),
      model: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [record] = await db.select().from(chapterAnalysis)
        .where(and(
          eq(chapterAnalysis.id, input.analysisId),
          eq(chapterAnalysis.userId, ctx.userId),
        ));

      if (!record) throw new TRPCError({ code: 'NOT_FOUND', message: '分析任务不存在' });
      if (record.status !== 'failed') throw new TRPCError({ code: 'BAD_REQUEST', message: '只能重试失败的任务' });

      // 重置状态
      const [updated] = await db.update(chapterAnalysis)
        .set({
          status: 'pending',
          errorMessage: null,
          result: null,
          progress: 0,
          updatedAt: new Date(),
        })
        .where(eq(chapterAnalysis.id, input.analysisId))
        .returning();

      return { analysisId: updated.id, status: updated.status };
    }),

  /** 恢复停滞的分析（服务重启后调用） */
  recoverStale: protectedProcedure
    .mutation(async () => {
      const count = await recoverStaleAnalyses();
      return { recovered: count };
    }),

  /** 标记为已阅 */
  dismiss: protectedProcedure
    .input(z.object({
      analysisId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [record] = await db.select().from(chapterAnalysis)
        .where(and(
          eq(chapterAnalysis.id, input.analysisId),
          eq(chapterAnalysis.userId, ctx.userId),
        ));

      if (!record) throw new TRPCError({ code: 'NOT_FOUND', message: '分析任务不存在' });

      await db.update(chapterAnalysis)
        .set({ dismissed: true, updatedAt: new Date() })
        .where(eq(chapterAnalysis.id, input.analysisId));

      return { success: true };
    }),

  /** 保存AI修改结果到持久化（type='modification'） */
  saveModificationResult: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      chapterId: z.string().uuid(),
      modificationContent: z.string(),
      modificationSummary: z.string().optional(),
      model: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      const model = input.model || await getUserModel(ctx.userId);
      const isThinking = isThinkingModel(model);

      const [record] = await db.insert(chapterAnalysis).values({
        projectId: input.projectId,
        chapterId: input.chapterId,
        userId: ctx.userId,
        type: 'modification',
        status: 'completed',
        result: input.modificationContent,
        progress: 100,
        metadata: {
          model,
          isThinking,
          summary: input.modificationSummary || '',
        },
      }).returning();

      return { analysisId: record.id };
    }),
});

// ========== 恢复停滞分析（服务重启时调用） ==========

export async function recoverStaleAnalyses(): Promise<number> {
  const result = await db.update(chapterAnalysis)
    .set({
      status: 'failed',
      errorMessage: '服务重启，任务中断',
      updatedAt: new Date(),
    })
    .where(eq(chapterAnalysis.status, 'processing'));

  return result.count ?? 0;
}
