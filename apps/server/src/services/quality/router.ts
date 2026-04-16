// 自检引擎 — 可配置的质量检查清单
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../trpc';
import { db } from '../../db';
import { qualityReports, chapterVersions } from '../../db/schema';

// 内置自检清单
export const DEFAULT_CHECKLIST = [
  // 基础检查（免费版可用）
  { id: 'typo', name: '错别字检查', category: 'basic', premium: false },
  { id: 'punctuation', name: '标点符号规范', category: 'basic', premium: false },
  { id: 'basic_logic', name: '基本逻辑检查', category: 'basic', premium: false },
  // 设定一致性（付费）
  { id: 'char_name', name: '角色名称一致性', category: 'consistency', premium: true },
  { id: 'char_trait', name: '角色性格一致性', category: 'consistency', premium: true },
  { id: 'world_rule', name: '世界观规则一致性', category: 'consistency', premium: true },
  { id: 'power_system', name: '力量体系一致性', category: 'consistency', premium: true },
  { id: 'timeline', name: '时间线一致性', category: 'consistency', premium: true },
  // 剧情逻辑（付费）
  { id: 'cause_effect', name: '因果逻辑', category: 'plot', premium: true },
  { id: 'motivation', name: '角色动机合理性', category: 'plot', premium: true },
  { id: 'foreshadow', name: '伏笔回收检查', category: 'plot', premium: true },
  // 节奏与可读性（付费）
  { id: 'pacing', name: '节奏分布', category: 'rhythm', premium: true },
  { id: 'hook', name: '章末钩子', category: 'rhythm', premium: true },
  { id: 'tension', name: '张力曲线', category: 'rhythm', premium: true },
  // 风格文字（付费）
  { id: 'style_consistency', name: '文风一致性', category: 'style', premium: true },
  { id: 'dialogue', name: '对话自然度', category: 'style', premium: true },
  { id: 'description', name: '描写质量', category: 'style', premium: true },
  { id: 'info_density', name: '信息密度', category: 'style', premium: true },
  { id: 'show_not_tell', name: '展示而非叙述', category: 'style', premium: true },
];

export const qualityRouter = router({
  getChecklist: protectedProcedure
    .input(z.object({ isPremium: z.boolean().default(false) }))
    .query(({ input }) => {
      if (input.isPremium) return DEFAULT_CHECKLIST;
      return DEFAULT_CHECKLIST.filter(c => !c.premium);
    }),

  // 执行自检（生成检查报告）
  runCheck: protectedProcedure
    .input(z.object({
      chapterVersionId: z.string().uuid(),
      checkItems: z.array(z.string()).min(1),
      isPremium: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const [version] = await db.select().from(chapterVersions)
        .where(eq(chapterVersions.id, input.chapterVersionId));
      if (!version) throw new TRPCError({ code: 'NOT_FOUND', message: '版本不存在' });

      // TODO: 实际调用 AI 进行自检，目前返回模拟结果
      const results: Record<string, unknown> = {};
      for (const itemId of input.checkItems) {
        const item = DEFAULT_CHECKLIST.find(c => c.id === itemId);
        if (!item) continue;
        if (item.premium && !input.isPremium) continue;
        results[itemId] = { status: 'pass', details: '' };
      }

      const checkedCount = Object.keys(results).length;
      const score = checkedCount > 0 ? Math.round((checkedCount / input.checkItems.length) * 100) : 0;

      const [report] = await db.insert(qualityReports).values({
        chapterVersionId: input.chapterVersionId,
        checkResults: results,
        score,
      }).returning();

      return report;
    }),

  // 获取检查报告
  getReport: protectedProcedure
    .input(z.object({ chapterVersionId: z.string().uuid() }))
    .query(async ({ input }) => {
      const [report] = await db.select().from(qualityReports)
        .where(eq(qualityReports.chapterVersionId, input.chapterVersionId));
      return report;
    }),
});
