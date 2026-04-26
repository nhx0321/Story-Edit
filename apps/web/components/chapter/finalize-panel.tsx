'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { streamAiChat } from '@/lib/ai-stream';

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
  { key: 'foreshadowing', label: '伏笔设置', placeholder: '本章设置的伏笔' },
  { key: 'cliffhanger', label: '悬念钩子', placeholder: '本章结尾的悬念钩子' },
  { key: 'pending_threads', label: '待回收线索', placeholder: '需要后续章节回收的线索' },
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

  // AI 模型配置（用于 AI 分析）
  const { data: configs } = trpc.ai.listConfigs.useQuery(undefined, { enabled: true });

  const [showL0L4, setShowL0L4] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activeLevel, setActiveLevel] = useState<string | null>(null);

  // L0: 项目基础经验
  const [l0Entries, setL0Entries] = useState<Record<string, string>>({});
  // L1: 写作经验
  const [l1Entries, setL1Entries] = useState<Record<string, string>>({});
  // L2: 伏笔跟踪
  const [l2Entries, setL2Entries] = useState<Record<string, string>>({});
  // L3: 章节分析
  const [l3Content, setL3Content] = useState('');
  // L4: 高级分析
  const [l4Content, setL4Content] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  const handleGenerateL0L4 = async () => {
    if (!configs || configs.length === 0) {
      alert('请先配置 AI 模型');
      return;
    }
    setGenerating(true);
    setShowL0L4(true);

    try {
      // ─── L0: 创作铁律 — 本项目必须做和不能做的事项（每章创作前必读） ───
      setActiveLevel('L0');
      const l0SysMsg = { role: 'system' as const, content: '你是一名资深文学编辑，严格按以下四类输出本章的创作铁律。每个类别用【】标题开头，内容1-2句话。\n\n【故事核心要素】故事类型、核心冲突、主线走向的必须/禁止规则\n【世界规则】世界观核心规则、力量体系基础的必须/禁止规则\n【角色成长弧】主角核心成长线、关键转折的必须/禁止规则\n【风格指南】写作风格、节奏特点的必须/禁止规则' };
      const l0UserMsg = { role: 'user' as const, content: `分析以下章节正文，按四类输出创作铁律：\n\n${editorContent.slice(0, 5000)}` };
      let l0FullResult = '';
      for await (const chunk of streamAiChat({
        configId: configs[0].id, messages: [l0SysMsg, l0UserMsg], projectId,
      })) {
        if (chunk.content) { l0FullResult += chunk.content; }
        if (chunk.error) break;
      }
      // 解析 L0 四类内容
      const l0CatMap: Record<string, string> = { story_core: '故事核心要素', world_rules: '世界规则', character_arc: '角色成长弧', style_guide: '风格指南' };
      for (const [key, label] of Object.entries(l0CatMap)) {
        const match = l0FullResult.match(new RegExp(`【${label}】[\\s\\n]*([^【]*)`));
        if (match?.[1]?.trim()) setL0Entries(prev => ({ ...prev, [key]: match[1].trim() }));
      }

      // ─── L1: 写作偏好 — 根据项目类型题材的风格要求（每章创作前必读） ───
      setActiveLevel('L1');
      const l1SysMsg = { role: 'system' as const, content: '你是一名专业文学编辑，严格按以下三类输出本章的写作偏好。每个类别用【】标题开头，内容1-2句话。\n\n【写作技巧】本章使用的写作技巧和手法\n【节奏经验】本章节奏控制的经验\n【对话心得】对话写作的心得体会' };
      const l1UserMsg = { role: 'user' as const, content: `分析以下章节正文，按三类输出写作偏好：\n\n${editorContent.slice(0, 5000)}` };
      let l1FullResult = '';
      for await (const chunk of streamAiChat({
        configId: configs[0].id, messages: [l1SysMsg, l1UserMsg], projectId,
      })) {
        if (chunk.content) { l1FullResult += chunk.content; }
        if (chunk.error) break;
      }
      // 解析 L1 三类内容
      const l1CatMap: Record<string, string> = { writing_technique: '写作技巧', pacing_experience: '节奏经验', dialogue_tips: '对话心得' };
      for (const [key, label] of Object.entries(l1CatMap)) {
        const match = l1FullResult.match(new RegExp(`【${label}】[\\s\\n]*([^【]*)`));
        if (match?.[1]?.trim()) setL1Entries(prev => ({ ...prev, [key]: match[1].trim() }));
      }

      // ─── L2: 经验总结 — 从写作对比中提取的最近创作经验（每章创作前必读） ───
      setActiveLevel('L2');
      const l2SysMsg = { role: 'system' as const, content: '你是一名资深文学编辑，严格按以下三类输出本章的经验总结。每个类别用【】标题开头，内容1-2句话。\n\n【伏笔设置】本章设置的伏笔\n【悬念钩子】本章结尾的悬念钩子\n【待回收线索】需要后续章节回收的线索' };
      const l2UserMsg = { role: 'user' as const, content: `分析以下章节正文，按三类输出经验总结：\n\n${editorContent.slice(0, 5000)}` };
      let l2FullResult = '';
      for await (const chunk of streamAiChat({
        configId: configs[0].id, messages: [l2SysMsg, l2UserMsg], projectId,
      })) {
        if (chunk.content) { l2FullResult += chunk.content; }
        if (chunk.error) break;
      }
      // 解析 L2 三类内容
      const l2CatMap: Record<string, string> = { foreshadowing: '伏笔设置', cliffhanger: '悬念钩子', pending_threads: '待回收线索' };
      for (const [key, label] of Object.entries(l2CatMap)) {
        const match = l2FullResult.match(new RegExp(`【${label}】[\\s\\n]*([^【]*)`));
        if (match?.[1]?.trim()) setL2Entries(prev => ({ ...prev, [key]: match[1].trim() }));
      }

      // ─── L3: 数值和伏笔 — 角色状态、经验值、道具数量、任务天数、伏笔线索等关键信息（每章自动更新） ───
      setActiveLevel('L3');
      const l3SysMsg = { role: 'system' as const, content: '你是一名专业数据提取员，从小说章节中提取可量化的数值信息和伏笔线索。严格按以下格式输出，不存在则写"无"：\n\n【角色状态】\n角色名：当前状态/等级/关键数值变化\n\n【道具/资源】\n道具名：数量变化/获取来源/消耗去向\n\n【任务/天数】\n当前任务：进度/剩余天数/完成状态\n\n【伏笔线索】\n伏笔描述：当前状态（已埋/已收/待回收）' };
      const l3UserMsg = { role: 'user' as const, content: `从以下章节正文中提取所有数值和伏笔信息：\n\n${editorContent.slice(0, 6000)}` };
      let l3Result = '';
      for await (const chunk of streamAiChat({
        configId: configs[0].id, messages: [l3SysMsg, l3UserMsg], projectId,
      })) {
        if (chunk.content) { l3Result += chunk.content; setL3Content(l3Result); }
        if (chunk.error) break;
      }

      // ─── L4: 写作对比 — 草稿与定稿差异分析（正文作者不阅读） ───
      setActiveLevel('L4');
      const l4SysMsg = { role: 'system' as const, content: '你是一名资深文学编辑，对以下已定稿的章节进行写作质量分析。请从以下维度输出（每项1-3句话）：\n\n1.【读者体验】代入感、情感共鸣\n2.【市场适配】类型契合度、读者定位\n3.【改进建议】可操作的具体优化方向\n4.【风格一致】与项目风格指南的契合度' };
      const l4UserMsg = { role: 'user' as const, content: `对以下已定稿章节进行写作对比分析：\n\n${editorContent.slice(0, 6000)}` };
      let l4Result = '';
      for await (const chunk of streamAiChat({
        configId: configs[0].id, messages: [l4SysMsg, l4UserMsg], projectId,
      })) {
        if (chunk.content) { l4Result += chunk.content; setL4Content(l4Result); }
        if (chunk.error) break;
      }
    } catch {
      setL3Content('分析失败，请重试');
      setL4Content('分析失败，请重试');
    }
    setGenerating(false);
    setActiveLevel(null);
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
                  <span className="flex items-center gap-2 justify-center">
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    分析中...
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
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
                  <span className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-gray-900 rounded-full" />
                  <span>正在生成 {activeLevel === 'L0' ? '创作铁律' : activeLevel === 'L1' ? '写作偏好' : activeLevel === 'L2' ? '经验总结' : activeLevel === 'L3' ? '数值和伏笔' : '写作对比'}...</span>
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
              <ExperienceSection title="L2 · 经验总结" description="从写作对比中提取的创作经验">
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
              <ExperienceSection title="L4 · 写作对比" description="草稿与定稿差异分析（正文作者不阅读）">
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
              {generating ? '分析中...' : 'AI 自动分析'}
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
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
            <span className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-gray-900 rounded-full" />
            <span>正在生成 {activeLevel === 'L0' ? '创作铁律' : activeLevel === 'L1' ? '写作偏好' : activeLevel === 'L2' ? '经验总结' : activeLevel === 'L3' ? '数值和伏笔' : '写作对比'}...</span>
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
            <ExperienceSection title="L2 · 经验总结" description="从写作对比中提取的最近创作经验（每章创作前必读）">
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
            <ExperienceSection title="L4 · 写作对比" description="草稿与定稿差异分析（正文作者不阅读）">
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
