'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

interface L0Entry {
  level: string;
  category: string;
  content: string;
}

interface L1L4Entry {
  level: string;
  category: string | null;
  content: string;
}

interface FinalizePanelProps {
  chapterId: string;
  projectId: string;
  chapterTitle: string;
  wordCount: number;
  isFinalized: boolean;
  currentVersionNumber: number;
  editorContent: string;
  onFinalize: () => Promise<void>;
  saveStatus: string;
}

const L0_CATEGORIES = [
  { key: 'story_core', label: '故事核心要素', placeholder: '故事类型、核心冲突、主线走向' },
  { key: 'world_rules', label: '世界规则', placeholder: '世界观核心规则、力量体系基础' },
  { key: 'character_arc', label: '角色成长弧', placeholder: '主角核心成长线、关键转折' },
  { key: 'style_guide', label: '风格指南', placeholder: '写作风格、节奏特点' },
];

const L1_CATEGORIES = [
  { key: 'writing_technique', label: '写作技巧', placeholder: '本章使用的写作技巧和手法' },
  { key: 'pacing_experience', label: '节奏经验', placeholder: '本章节奏控制的经验' },
  { key: 'dialogue_tips', label: '对话心得', placeholder: '对话写作的心得体会' },
];

const L2_CATEGORIES = [
  { key: 'writing_gains', label: '写作收获', placeholder: '本章写得好的地方和可复用的技法' },
  { key: 'improvement', label: '改进方向', placeholder: '本章的不足和下次可改进之处' },
  { key: 'attention_points', label: '注意事项', placeholder: '创作中需要持续关注的要点' },
];

export function FinalizePanel({
  chapterId, projectId, chapterTitle, wordCount,
  isFinalized, currentVersionNumber, editorContent,
  onFinalize, saveStatus,
}: FinalizePanelProps) {
  const utils = trpc.useUtils();
  const { data: existingLevels } = trpc.memory.list.useQuery(
    { projectId, activeOnly: true },
    { enabled: true },
  );

  const [showL0L4, setShowL0L4] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activeLevel, setActiveLevel] = useState<string | null>(null);
  const [isThinkingModel, setIsThinkingModel] = useState(false);

  // L0: 项目基础经验
  const [l0Entries, setL0Entries] = useState<Record<string, string>>({});
  // L1: 写作经验
  const [l1Entries, setL1Entries] = useState<Record<string, string>>({});
  // L2: 经验总结
  const [l2Entries, setL2Entries] = useState<Record<string, string>>({});
  // L3: 数值和伏笔
  const [l3Content, setL3Content] = useState('');
  // L4: 高级分析
  const [l4Content, setL4Content] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Analysis persistence state
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load existing entries when available
  useEffect(() => {
    if (!existingLevels) return;
    for (const entry of existingLevels) {
      if (entry.level === 'L0' && entry.category) {
        setL0Entries(prev => ({ ...prev, [entry.category!]: entry.content }));
      } else if (entry.level === 'L1' && entry.category) {
        setL1Entries(prev => ({ ...prev, [entry.category!]: entry.content }));
      } else if (entry.level === 'L2' && entry.category) {
        setL2Entries(prev => ({ ...prev, [entry.category!]: entry.content }));
      } else if (entry.level === 'L3') {
        setL3Content(entry.content);
      } else if (entry.level === 'L4') {
        setL4Content(entry.content);
      }
    }
  }, [existingLevels]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Parse combined L0-L4 result from background analysis
  const parseL0L4Result = (result: string) => {
    // L0: 创作铁律
    const l0CatMap: Record<string, string> = { story_core: '故事核心要素', world_rules: '世界规则', character_arc: '角色成长弧', style_guide: '风格指南' };
    for (const [key, label] of Object.entries(l0CatMap)) {
      const match = result.match(new RegExp(`【${label}】[\\s\\n]*([^【]*)`));
      if (match?.[1]?.trim()) setL0Entries(prev => ({ ...prev, [key]: match[1].trim() }));
    }
    // L1: 写作偏好
    const l1CatMap: Record<string, string> = { writing_technique: '写作技巧', pacing_experience: '节奏经验', dialogue_tips: '对话心得' };
    for (const [key, label] of Object.entries(l1CatMap)) {
      const match = result.match(new RegExp(`【${label}】[\\s\\n]*([^【]*)`));
      if (match?.[1]?.trim()) setL1Entries(prev => ({ ...prev, [key]: match[1].trim() }));
    }
    // L2: 经验总结
    const l2CatMap: Record<string, string> = { writing_gains: '写作收获', improvement: '改进方向', attention_points: '注意事项' };
    for (const [key, label] of Object.entries(l2CatMap)) {
      const match = result.match(new RegExp(`【${label}】[\\s\\n]*([^【]*)`));
      if (match?.[1]?.trim()) setL2Entries(prev => ({ ...prev, [key]: match[1].trim() }));
    }
    // L3 & L4: extract content between headers
    const l3Match = result.match(/【L3分析结果】([\s\S]*?)(?=(【L4分析结果】|$))/);
    if (l3Match?.[1]?.trim()) setL3Content(l3Match[1].trim());
    const l4Match = result.match(/【L4分析结果】([\s\S]*?)$/);
    if (l4Match?.[1]?.trim()) setL4Content(l4Match[1].trim());
    // If no section markers, try level headers
    if (!l3Match && !l4Match) {
      const l3BySection = result.match(/【L0分析结果】([\s\S]*?)(?=(【L1分析结果】|$))/);
      // Extract L3/L4 from labeled sections in combined result
      const l3Section = result.match(/【角色状态】/);
      if (l3Section) {
        // If it has 角色状态 header, likely L3 is inline — extract between L2 and L4 sections
        const l2End = result.indexOf('L2');
        const l4Start = result.indexOf('L4');
        // Keep existing content as fallback
      }
      // Fallback: set L3 and L4 to the whole result if nothing parsed
      if (!result.includes('写作对比')) setL3Content(result);
    }
  };

  // Poll analysis status
  const startPollingL0L4 = useRef((analysisId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const status = await utils.client.analysis.getStatus.query({ analysisId });
        if (status.status === 'completed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setGenerating(false);
          setActiveLevel(null);
          setAnalysisProgress(100);
          // Parse and populate L0-L4 entries
          if (status.result) {
            parseL0L4Result(status.result);
          }
          setShowL0L4(true);
        } else if (status.status === 'failed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setGenerating(false);
          setActiveLevel(null);
          setL3Content('分析失败：' + (status.errorMessage || '未知错误'));
          setL4Content('分析失败：' + (status.errorMessage || '未知错误'));
          setShowL0L4(true);
        } else if (status.status === 'processing') {
          setAnalysisProgress(status.progress || 0);
          // Update active level from metadata (parallel or serial)
          const meta = status.metadata as Record<string, unknown> | null;
          if (meta) {
            if (meta.mode === 'parallel' && Array.isArray(meta.completed_levels)) {
              const count = (meta.completed_levels as string[]).length;
              setActiveLevel(`parallel:${count}`);
            } else if ('current_level' in meta) {
              const level = meta.current_level as string;
              if (level && level !== 'done') setActiveLevel(level);
            }
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000);
  }).current;

  const handleGenerateL0L4 = async () => {
    if (!editorContent) {
      alert('暂无正文内容');
      return;
    }
    setGenerating(true);
    setShowL0L4(true);
    try {
      const result = await utils.client.analysis.start.mutate({
        projectId,
        chapterId,
        type: 'l0_l4_summary',
        editorContent: editorContent,
        chapterTitle,
      });
      setCurrentAnalysisId(result.analysisId);
      setIsThinkingModel(result.isThinking);
      startPollingL0L4(result.analysisId);
    } catch (err: unknown) {
      setGenerating(false);
      setL3Content('发起分析失败：' + (err instanceof Error ? err.message : '未知错误'));
      setL4Content('发起分析失败');
      setShowL0L4(true);
    }
  };

  // Save analysis results to memory entries (L0-L4)
  const handleSaveAnalysis = async () => {
    setSaving(true);
    try {
      // Save L0-L4 entries in batch
      const entries: Array<{ level: string; category?: string; content: string }> = [];

      // L0 entries
      for (const [category, content] of Object.entries(l0Entries)) {
        if (content.trim()) {
          entries.push({ level: 'L0', category, content });
        }
      }
      // L1 entries
      for (const [category, content] of Object.entries(l1Entries)) {
        if (content.trim()) {
          entries.push({ level: 'L1', category, content });
        }
      }
      // L2 entries
      for (const [category, content] of Object.entries(l2Entries)) {
        if (content.trim()) {
          entries.push({ level: 'L2', category, content });
        }
      }
      // L3
      if (l3Content.trim()) {
        entries.push({ level: 'L3', content: l3Content });
      }
      // L4
      if (l4Content.trim()) {
        entries.push({ level: 'L4', content: l4Content });
      }

      // Save each entry individually using memory.upsert (merge if same category)
      for (const entry of entries) {
        await utils.client.memory.upsert.mutate({
          projectId,
          level: entry.level as 'L0' | 'L1' | 'L2' | 'L3' | 'L4',
          category: entry.category,
          content: entry.content,
          sourceChapterId: chapterId,
        });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      // Invalidate memory list
      utils.memory.list.invalidate({ projectId });

      // Refresh workflow progress
      window.dispatchEvent(new CustomEvent('workflow-step-completed'));
    } catch {
      alert('保存失败');
    }
    setSaving(false);
  };

  if (isFinalized) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        {/* 已定稿状态（紧凑） */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-green-700">已定稿</span>
              <span className="text-xs text-gray-400">v{currentVersionNumber || '-'} · {wordCount}字</span>
            </div>
            <button onClick={onFinalize} disabled={saveStatus === 'saving'}
              className="text-xs text-gray-400 hover:text-gray-600 underline transition">
              {saveStatus === 'saving' ? '保存中...' : '重新定稿'}
            </button>
          </div>
        </div>

        {/* 总结经验（主区域） */}
        <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 p-8 text-center">
          {!showL0L4 ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">章节经验总结</h2>
              <p className="text-sm text-gray-500 mb-6">
                分析本章正文，提取 L0-L4 级别经验并保存到项目经验库
              </p>
              <button onClick={handleGenerateL0L4} disabled={generating}
                className="px-8 py-3 bg-gradient-to-r from-gray-800 to-gray-900 text-white rounded-xl text-base font-medium hover:from-gray-900 hover:to-black transition disabled:opacity-50 shadow-sm">
                {generating ? (
                  <span className="flex items-center gap-2 justify-center text-center">
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full shrink-0" />
                    <span className="text-xs leading-tight">{isThinkingModel ? 'AI正在进行详细分析，持续总结，优化创作经验，请耐心等候。' : 'AI正在思考中，请稍候...'}</span>
                  </span>
                ) : '总结经验'}
              </button>
              <p className="text-xs text-gray-400 mt-4">
                将自动分析本创作铁律、写作偏好、经验总结、数值伏笔和写作对比
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">分析完成</h2>
                <button onClick={handleSaveAnalysis} disabled={saving}
                  className="px-6 py-2 bg-gradient-to-r from-gray-800 to-gray-900 text-white rounded-lg text-sm font-medium hover:from-gray-900 hover:to-black transition disabled:opacity-50 shadow-sm">
                  {saving ? '保存中...' : saved ? '已保存 ✓' : '保存到经验库'}
                </button>
              </div>
              {generating && (
                <div className="flex flex-col gap-1 text-sm text-gray-400 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-gray-900 rounded-full shrink-0" />
                    <span>{isThinkingModel ? 'AI正在进行详细分析，持续总结，优化创作经验，请耐心等候。' : 'AI正在思考中，请稍候...'}</span>
                  </div>
                  <span className="text-xs text-gray-400 ml-6">
                    {activeLevel?.startsWith('parallel:') ? `正在并行分析中... (${activeLevel.split(':')[1]}/5 已完成)` : `正在分析 ${activeLevel === 'L0' ? '创作铁律' : activeLevel === 'L1' ? '写作偏好' : activeLevel === 'L2' ? '经验总结' : activeLevel === 'L3' ? '数值和伏笔' : '写作对比'}...`}
                  </span>
                </div>
              )}
            </>
          )}

          {showL0L4 && (
            <div className="text-left space-y-4 mt-4">
              {/* L0: 创作铁律 */}
              <ExperienceSection title="L0 · 创作铁律" description="本项目必须做和不能做的事项">
                {L0_CATEGORIES.map(cat => (
                  <div key={cat.key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1 text-left">{cat.label}</label>
                    <textarea value={l0Entries[cat.key] || ''} onChange={e => setL0Entries(prev => ({ ...prev, [cat.key]: e.target.value }))}
                      className="w-full h-16 px-3 py-2 text-sm bg-white border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" placeholder={cat.placeholder} />
                  </div>
                ))}
              </ExperienceSection>

              {/* L1: 写作偏好 */}
              <ExperienceSection title="L1 · 写作偏好" description="根据项目题材的风格要求">
                {L1_CATEGORIES.map(cat => (
                  <div key={cat.key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1 text-left">{cat.label}</label>
                    <textarea value={l1Entries[cat.key] || ''} onChange={e => setL1Entries(prev => ({ ...prev, [cat.key]: e.target.value }))}
                      className="w-full h-16 px-3 py-2 text-sm bg-white border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" placeholder={cat.placeholder} />
                  </div>
                ))}
              </ExperienceSection>

              {/* L2: 经验总结 */}
              <ExperienceSection title="L2 · 经验总结" description="本章写作收获、改进方向和注意事项">
                {L2_CATEGORIES.map(cat => (
                  <div key={cat.key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1 text-left">{cat.label}</label>
                    <textarea value={l2Entries[cat.key] || ''} onChange={e => setL2Entries(prev => ({ ...prev, [cat.key]: e.target.value }))}
                      className="w-full h-16 px-3 py-2 text-sm bg-white border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" placeholder={cat.placeholder} />
                  </div>
                ))}
              </ExperienceSection>

              {/* L3: 数值和伏笔 */}
              <ExperienceSection title="L3 · 数值和伏笔" description="角色状态、经验值、道具数量、任务天数、伏笔线索">
                <textarea value={l3Content} onChange={e => setL3Content(e.target.value)}
                  className="w-full h-40 p-4 text-sm bg-white border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 leading-relaxed" placeholder="AI 分析后自动生成..." />
              </ExperienceSection>

              {/* L4: 写作对比 */}
              <ExperienceSection title="L4 · 写作对比" description="草稿与定稿差异分析、修改意图提炼（正文作者不阅读）">
                <textarea value={l4Content} onChange={e => setL4Content(e.target.value)}
                  className="w-full h-40 p-4 text-sm bg-white border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 leading-relaxed" placeholder="AI 分析后自动生成..." />
              </ExperienceSection>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 定稿确认 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold mb-4">确认定稿</h2>
        <p className="text-sm text-gray-600 mb-4">
          确认本章正文已修改完毕，可以定稿？定稿后将自动标记当前版本为最终版本。
        </p>
        <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">章节标题</span>
              <p className="font-medium">{chapterTitle || '-'}</p>
            </div>
            <div>
              <span className="text-gray-500">当前字数</span>
              <p className="font-medium">{wordCount} 字</p>
            </div>
          </div>
        </div>
        <button onClick={onFinalize} disabled={saveStatus === 'saving' || !editorContent.trim()}
          className="w-full py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50">
          确认定稿
        </button>
      </div>

      {/* L0-L4 分析区域 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">L0-L4 经验分析</h2>
          {!showL0L4 ? (
            <button onClick={handleGenerateL0L4} disabled={generating}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
              {generating ? (isThinkingModel ? 'Thinking模式等待中...' : 'AI思考中...') : 'AI 自动分析'}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={handleSaveAnalysis} disabled={saving}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                {saving ? '保存中...' : saved ? '已保存 ✓' : '保存到经验库'}
              </button>
            </div>
          )}
        </div>

        {generating && (
          <div className="flex flex-col gap-1 text-sm text-gray-400 mb-4">
            <div className="flex items-center gap-2">
              <span className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-gray-900 rounded-full shrink-0" />
              <span>{isThinkingModel ? 'AI正在进行详细分析，持续总结，优化创作经验，请耐心等候。' : 'AI正在思考中，请稍候...'}</span>
            </div>
            <span className="text-xs text-gray-400 ml-6">
              {activeLevel?.startsWith('parallel:') ? `正在并行分析中... (${activeLevel.split(':')[1]}/5 已完成)` : `正在分析 ${activeLevel === 'L0' ? '创作铁律' : activeLevel === 'L1' ? '写作偏好' : activeLevel === 'L2' ? '经验总结' : activeLevel === 'L3' ? '数值和伏笔' : '写作对比'}...`}
            </span>
          </div>
        )}

        {showL0L4 && (
          <div className="space-y-4">
            {/* L0: 创作铁律 */}
            <ExperienceSection title="L0 · 创作铁律" description="本项目必须做和不能做的事项（每章创作前必读）">
              {L0_CATEGORIES.map(cat => (
                <div key={cat.key}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{cat.label}</label>
                  <textarea value={l0Entries[cat.key] || ''} onChange={e => setL0Entries(prev => ({ ...prev, [cat.key]: e.target.value }))}
                    className="w-full h-16 px-3 py-2 text-sm bg-white border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" placeholder={cat.placeholder} />
                </div>
              ))}
            </ExperienceSection>

            {/* L1: 写作偏好 */}
            <ExperienceSection title="L1 · 写作偏好" description="根据项目类型题材的风格要求（每章创作前必读）">
              {L1_CATEGORIES.map(cat => (
                <div key={cat.key}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{cat.label}</label>
                  <textarea value={l1Entries[cat.key] || ''} onChange={e => setL1Entries(prev => ({ ...prev, [cat.key]: e.target.value }))}
                    className="w-full h-16 px-3 py-2 text-sm bg-white border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" placeholder={cat.placeholder} />
                </div>
              ))}
            </ExperienceSection>

            {/* L2: 经验总结 */}
            <ExperienceSection title="L2 · 经验总结" description="本章写作收获、改进方向和注意事项（每章创作前必读）">
              {L2_CATEGORIES.map(cat => (
                <div key={cat.key}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{cat.label}</label>
                  <textarea value={l2Entries[cat.key] || ''} onChange={e => setL2Entries(prev => ({ ...prev, [cat.key]: e.target.value }))}
                    className="w-full h-16 px-3 py-2 text-sm bg-white border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" placeholder={cat.placeholder} />
                </div>
              ))}
            </ExperienceSection>

            {/* L3: 数值和伏笔 */}
            <ExperienceSection title="L3 · 数值和伏笔" description="角色状态、经验值、道具数量、任务天数、伏笔线索等关键信息（每章自动更新）">
              <textarea value={l3Content} onChange={e => setL3Content(e.target.value)}
                className="w-full h-40 p-4 text-sm bg-white border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 leading-relaxed" placeholder="AI 分析后自动生成..." />
            </ExperienceSection>

            {/* L4: 写作对比 */}
            <ExperienceSection title="L4 · 写作对比" description="草稿与定稿差异分析、修改意图提炼（正文作者不阅读）">
              <textarea value={l4Content} onChange={e => setL4Content(e.target.value)}
                className="w-full h-40 p-4 text-sm bg-white border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 leading-relaxed" placeholder="AI 分析后自动生成..." />
            </ExperienceSection>
          </div>
        )}
      </div>

      {/* 大纲/设定关联引导 */}
      <div className="grid grid-cols-2 gap-4">
        <Link href={`/project/${projectId}/outline`}
          className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-400 transition text-center">
          <p className="text-sm font-medium text-gray-900">前往大纲编辑</p>
          <p className="text-xs text-gray-400 mt-1">调整剧情结构</p>
        </Link>
        <Link href={`/project/${projectId}/settings`}
          className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-400 transition text-center">
          <p className="text-sm font-medium text-gray-900">前往设定管理</p>
          <p className="text-xs text-gray-400 mt-1">补充世界观设定</p>
        </Link>
      </div>
    </div>
  );
}

// ─── 经验章节子组件 ──────────────────────────────────────────
function ExperienceSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-700">{title}</span>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}
