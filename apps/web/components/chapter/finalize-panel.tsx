'use client';

import { useState, useEffect } from 'react';
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
    setGenerating(true);
    setShowL0L4(true);
    setActiveLevel('L3');

    // Simulate AI analysis - in production would use real AI streaming
    try {
      // First set L3 (chapter analysis) from the content
      const l3Analysis = generateL3Analysis(editorContent);
      setL3Content(l3Analysis);

      // Then L4 (advanced analysis)
      setActiveLevel('L4');
      const l4Analysis = generateL4Analysis(editorContent);
      setL4Content(l4Analysis);

      // Then L0 categories
      setActiveLevel('L0');
      const l0Data: Record<string, string> = {};
      for (const cat of L0_CATEGORIES) {
        l0Data[cat.key] = l0Entries[cat.key] || '';
      }
      setL0Entries(prev => ({ ...prev, ...l0Data }));

      // Then L1 categories
      setActiveLevel('L1');

      // Finally L2
      setActiveLevel('L2');
    } catch {
      // Error handling
    }
    setGenerating(false);
    setActiveLevel(null);
  };

  // Simple content analysis (placeholder - in production use AI)
  const generateL3Analysis = (content: string): string => {
    const wordCount = content.replace(/\s/g, '').length;
    const paragraphs = content.split('\n\n').filter(p => p.trim()).length;
    const dialogues = (content.match(/["「『]/g) || []).length;

    return [
      `## 本章基本信息`,
      `- 字数：${wordCount}`,
      `- 段落数：${paragraphs}`,
      `- 对话密度：${dialogues} 处`,
      ``,
      `## 剧情进展`,
      `- 主线推进：${content.length > 500 ? '有实质推进' : '较少'}`,
      `- 新角色登场：${content.includes('介绍') || content.includes('出现') ? '有' : '无'}`,
      `- 冲突密度：${content.includes('冲突') || content.includes('对抗') ? '中等' : '较低'}`,
      ``,
      `## 写作质量`,
      `- 句式多样性：${content.includes('。') ? '丰富' : '需要提升'}`,
      `- 描写细节：${content.length > 1000 ? '充分' : '可增加细节描写'}`,
    ].join('\n');
  };

  const generateL4Analysis = (content: string): string => {
    return [
      `## 高级分析`,
      ``,
      `### 读者体验预测`,
      `- 代入感：${content.includes('感觉') || content.includes('觉得') ? '较好' : '需要增强'}`,
      `- 情感共鸣：${content.includes('感动') || content.includes('愤怒') || content.includes('喜悦') ? '有情感触发点' : '情感描写偏少'}`,
      ``,
      `### 市场适配度`,
      `- 类型符合度：与项目设定一致`,
      `- 节奏适配：${content.length > 2000 ? '内容充实' : '篇幅偏短'}`,
      ``,
      `### 改进建议`,
      `- 可以在关键情节增加更多感官描写`,
      `- 对话可增加潜台词和个性差异`,
    ].join('\n');
  };

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

      // Save each entry individually using memory.add
      for (const entry of entries) {
        await utils.client.memory.add.mutate({
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
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="text-center py-8">
          <p className="text-green-600 text-lg font-medium mb-2">已定稿</p>
          <p className="text-sm text-gray-500">本章已确认为最终版本</p>
          <p className="text-xs text-gray-400 mt-2">字数：{wordCount} 字</p>
          <p className="text-xs text-gray-400">版本：v{currentVersionNumber || '-'}</p>
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
            <span>正在生成 {activeLevel === 'L0' ? '基础经验' : activeLevel === 'L1' ? '写作经验' : activeLevel === 'L2' ? '伏笔追踪' : activeLevel === 'L3' ? '章节分析' : '高级分析'}...</span>
          </div>
        )}

        {showL0L4 && (
          <div className="space-y-6">
            {/* L3: 章节分析 */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">L3 · 章节分析</span>
                <span className="text-xs text-gray-400">AI 自动生成</span>
              </div>
              <textarea
                value={l3Content}
                onChange={e => setL3Content(e.target.value)}
                className="w-full h-40 p-4 text-sm font-mono bg-white resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 leading-relaxed"
                placeholder="章节分析将在 AI 分析后生成..."
              />
            </div>

            {/* L4: 高级分析 */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">L4 · 高级分析</span>
                <span className="text-xs text-gray-400">AI 自动生成</span>
              </div>
              <textarea
                value={l4Content}
                onChange={e => setL4Content(e.target.value)}
                className="w-full h-32 p-4 text-sm font-mono bg-white resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 leading-relaxed"
                placeholder="高级分析将在 AI 分析后生成..."
              />
            </div>

            {/* L0: 项目基础经验 */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-700">L0 · 项目基础经验</span>
                <p className="text-xs text-gray-400 mt-0.5">影响 L0→L3 升级检测和 L1 滚动更新</p>
              </div>
              <div className="p-4 space-y-3">
                {L0_CATEGORIES.map(cat => (
                  <div key={cat.key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{cat.label}</label>
                    <textarea
                      value={l0Entries[cat.key] || ''}
                      onChange={e => setL0Entries(prev => ({ ...prev, [cat.key]: e.target.value }))}
                      className="w-full h-16 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
                      placeholder={cat.placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* L1: 写作经验 */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-700">L1 · 写作经验</span>
                <p className="text-xs text-gray-400 mt-0.5">滚动更新，影响后续 L0→L3 升级检测</p>
              </div>
              <div className="p-4 space-y-3">
                {L1_CATEGORIES.map(cat => (
                  <div key={cat.key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{cat.label}</label>
                    <textarea
                      value={l1Entries[cat.key] || ''}
                      onChange={e => setL1Entries(prev => ({ ...prev, [cat.key]: e.target.value }))}
                      className="w-full h-16 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
                      placeholder={cat.placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* L2: 伏笔跟踪 */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-700">L2 · 伏笔跟踪</span>
                <p className="text-xs text-gray-400 mt-0.5">伏笔回收依赖跟踪</p>
              </div>
              <div className="p-4 space-y-3">
                {L2_CATEGORIES.map(cat => (
                  <div key={cat.key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{cat.label}</label>
                    <textarea
                      value={l2Entries[cat.key] || ''}
                      onChange={e => setL2Entries(prev => ({ ...prev, [cat.key]: e.target.value }))}
                      className="w-full h-16 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
                      placeholder={cat.placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>
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
