'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { StoryEditor } from '@/components/editor/story-editor';
import { VersionPanel } from '@/components/version/version-panel';
import { ChatPanel } from '@/components/chat/chat-panel';
import { WritingStylePanel } from '@/components/chapter/writing-style-panel';
import { SelfCheckPanel, type CheckItem } from '@/components/chapter/self-check-panel';
import { ModifyPanel } from '@/components/chapter/modify-panel';
import { FinalizePanel } from '@/components/chapter/finalize-panel';
import { ExperiencePanel } from '@/components/experience/experience-panel';
import { OutlineSidebar } from '@/components/chapter/outline-sidebar';
import { useWorkflowProgress } from '@/lib/use-workflow-progress';
import { ProjectSidebar } from '@/components/layout/project-sidebar';
import { formatChapterContent } from '@/lib/format-content';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';

type TabKey = 'brief' | 'draft' | 'checklist' | 'modify' | 'finalize';

function exportChapterDocx(params: {
  projectTitle?: string;
  volumeTitle?: string;
  unitTitle?: string;
  chapterTitle?: string;
  content: string;
  isFinal: boolean;
}) {
  const plainText = params.content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();

  const children: Paragraph[] = [
    new Paragraph({
      text: params.chapterTitle || '章节正文',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 320 },
    }),
    new Paragraph({
      children: [new TextRun(`项目：${params.projectTitle || '未命名项目'}`)],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun(`位置：${params.volumeTitle || '未分卷'} / ${params.unitTitle || '未分单元'}`)],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun(`状态：${params.isFinal ? '已定稿' : '草稿'}`)],
      spacing: { after: 200 },
    }),
  ];

  const paragraphs = plainText.split(/\n\n+/).filter(p => p.trim());
  if (paragraphs.length === 0) {
    children.push(new Paragraph({ children: [new TextRun('当前没有可导出的正文内容。')] }));
  } else {
    for (const para of paragraphs) {
      children.push(new Paragraph({ children: [new TextRun(para.trim())], spacing: { after: 120 } }));
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBlob(doc).then(blob => {
    saveAs(blob, `${params.chapterTitle || '章节正文'}_${params.isFinal ? '定稿' : '草稿'}.docx`);
  });
}

interface ChapterWorkspaceProps {
  projectId: string;
  chapterId: string;
}

export function ChapterWorkspace({ projectId, chapterId }: ChapterWorkspaceProps) {
  const progress = useWorkflowProgress(projectId);
  const { data: projectData } = trpc.project.get.useQuery({ id: projectId });
  const { data: chapterDetail, isLoading: detailLoading } = trpc.workflow.getChapterDetail.useQuery(
    { chapterId },
  );
  const { data: taskBriefData, isLoading: briefLoading } = trpc.workflow.generateTaskBrief.useQuery(
    { chapterId },
  );

  const utils = trpc.useUtils();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>('brief');
  const [editableBrief, setEditableBrief] = useState('');
  const [briefConfirmed, setBriefConfirmed] = useState(false);

  // Draft editor state
  const [editorContent, setEditorContent] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Self-check / Analysis state
  const [selfCheckReport, setSelfCheckReport] = useState<string | null>(null);
  const [selfCheckGenerating, setSelfCheckGenerating] = useState(false);
  const [selfCheckItems, setSelfCheckItems] = useState<CheckItem[]>([]);
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [isThinkingModel, setIsThinkingModel] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState<string | null>(null);
  const [showCompletedNotification, setShowCompletedNotification] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Modify state
  const [modifyHighlightTexts, setModifyHighlightTexts] = useState<string[]>([]);
  const [autoModify, setAutoModify] = useState(false);
  /** 修改应用后的正文（独立于草稿编辑器，不覆盖开始创作的内容） */
  const [modifiedContent, setModifiedContent] = useState('');

  // Panel state
  const [versionPanelOpen, setVersionPanelOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [writingStyleOpen, setWritingStyleOpen] = useState(false);
  const [experiencePanelOpen, setExperiencePanelOpen] = useState(false);

  // Get AI configs for self-check
  const { data: configs } = trpc.ai.listConfigs.useQuery(undefined, { enabled: activeTab === 'checklist' || activeTab === 'modify' || activeTab === 'finalize' });

  // Save chapter content mutation
  const saveChapterMutation = trpc.workflow.saveChapterContent.useMutation({
    onSuccess: () => {
      setSaveStatus('saved');
      utils.workflow.getChapterDetail.invalidate({ chapterId });
      setTimeout(() => setSaveStatus('idle'), 2000);
    },
    onError: () => {
      setSaveStatus('idle');
      alert('保存失败，请重试');
    },
  });

  // Save experience mutation (legacy)
  const saveExpMutation = trpc.workflow.saveChapterExperience.useMutation();
  // Save modification result persistence
  const saveModificationMutation = trpc.analysis.saveModificationResult.useMutation();

  // Set editable brief when data loads
  useEffect(() => {
    if (taskBriefData?.brief && !editableBrief && !briefConfirmed) {
      setEditableBrief(taskBriefData.brief);
    }
  }, [taskBriefData?.brief, editableBrief, briefConfirmed]);

  // Set editor content when chapter detail loads (auto-format on first load)
  useEffect(() => {
    if (chapterDetail?.latestVersion?.content && !editorContent) {
      const formatted = formatChapterContent(chapterDetail.latestVersion.content);
      setEditorContent(formatted);
    }
  }, [chapterDetail?.latestVersion?.content, editorContent]);

  // Listen for workflow step completion events
  useEffect(() => {
    const handler = () => progress.refetch();
    window.addEventListener('workflow-step-completed', handler);
    return () => window.removeEventListener('workflow-step-completed', handler);
  }, [progress]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Poll analysis status
  const startPolling = useCallback((analysisId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const status = await utils.client.analysis.getStatus.query({ analysisId });
        if (status.status === 'completed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setSelfCheckReport(status.result);
          if (status.result) {
            const items = parseCheckItems(status.result);
            setSelfCheckItems(items);
          }
          setSelfCheckGenerating(false);
          setAnalysisProgress(100);
          setShowResumeDialog(null);
        } else if (status.status === 'failed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setSelfCheckReport(status.errorMessage || '分析失败');
          setSelfCheckGenerating(false);
          setShowResumeDialog(null);
        } else if (status.status === 'processing') {
          setAnalysisProgress(status.progress || 0);
        }
      } catch {
        // Ignore polling errors, will retry on next interval
      }
    }, 2000);
  }, [utils]);

  // Recovery detection: check for pending/completed analyses on mount
  useEffect(() => {
    if (!chapterId) return;
    utils.client.analysis.listByChapter.query({ chapterId }).then(results => {
      // 检查 modification 类型 — R4b: 恢复AI修改结果
      const modificationRecords = results.filter(r => r.type === 'modification' && r.status === 'completed' && r.result);
      if (modificationRecords.length > 0 && !modifiedContent) {
        const latest = modificationRecords[0];
        setModifiedContent(latest.result || '');
        setShowCompletedNotification(latest.id);
      }

      const pending = results.filter(r => r.status === 'processing');
      const completed = results.filter(r => r.status === 'completed' && !r.dismissed && r.type !== 'modification');
      if (pending.length > 0) {
        setShowResumeDialog(pending[0].id);
        startPolling(pending[0].id);
      }
      if (completed.length > 0) {
        setShowCompletedNotification(completed[0].id);
      }
    }).catch(() => {});
  }, [chapterId, utils, modifiedContent, startPolling]);

  const chapter = chapterDetail?.chapter;
  const unit = chapterDetail?.unit;
  const volume = chapterDetail?.volume;
  const currentVersion = chapterDetail?.latestVersion;
  const isFinalized = currentVersion?.isFinal;
  const wordCount = editorContent.replace(/\s/g, '').length;

  const handleSaveDraft = useCallback(() => {
    if (!editorContent.trim()) return;
    setSaveStatus('saving');
    saveChapterMutation.mutate({
      chapterId,
      content: editorContent,
      versionLabel: `草稿 v${(currentVersion?.versionNumber || 0) + 1}`,
      isFinal: false,
      wordCount,
    });
  }, [editorContent, chapterId, saveChapterMutation, currentVersion, wordCount]);

  const handleFinalize = useCallback(async () => {
    if (!editorContent.trim()) return;
    setSaveStatus('saving');
    try {
      await saveChapterMutation.mutateAsync({
        chapterId,
        content: editorContent,
        versionLabel: `定稿 v${(currentVersion?.versionNumber || 0) + 1}`,
        isFinal: true,
        wordCount,
      });
      window.dispatchEvent(new CustomEvent('workflow-step-completed'));
    } catch {
      // error handled by mutation
    }
  }, [editorContent, chapterId, saveChapterMutation, currentVersion, wordCount]);

  const handleLoadVersion = useCallback((content: string) => {
    setEditorContent(content);
    setVersionPanelOpen(false);
  }, []);

  const handleExportCurrentChapter = useCallback(async () => {
    const content = editorContent.trim() || chapterDetail?.latestVersion?.content || '';
    await exportChapterDocx({
      projectTitle: projectData?.name,
      volumeTitle: volume?.title,
      unitTitle: unit?.title,
      chapterTitle: chapter?.title,
      content,
      isFinal: !!currentVersion?.isFinal,
    });
  }, [editorContent, chapterDetail?.latestVersion?.content, projectData?.name, volume?.title, unit?.title, chapter?.title, currentVersion?.isFinal]);

  // Self-check: parse report into structured items
  const parseCheckItems = (report: string): CheckItem[] => {
    const items: CheckItem[] = [];
    const types: CheckItem['type'][] = ['consistency', 'character', 'setting', 'logic', 'pacing', 'quality'];

    // 尝试用 ##/### 节标题拆分
    let sections = report.split(/### |## /).filter(Boolean);

    // 如果没有 ##/### 标题，尝试用数字编号拆分（如 "1."、"2." 等）
    if (sections.length <= 1) {
      sections = report.split(/\n\d+\.\s*/).filter(s => s.trim());
      // 第一段通常是说明文字，跳过
      if (sections.length > 1) sections = sections.slice(1);
    }

    // 如果还是没有拆分出多个节，尝试用 "原因"、"建议" 等关键字查找
    if (sections.length <= 1) {
      const lines = report.split('\n').filter(Boolean);
      let currentSection = '';
      for (const line of lines) {
        if (/原因|建议|修改|原文|问题/.test(line) && line.length < 50) {
          if (currentSection) sections.push(currentSection);
          currentSection = line;
        } else {
          currentSection += '\n' + line;
        }
      }
      if (currentSection) sections.push(currentSection);
    }

    // 如果还是只有一段，整段作为一条
    if (sections.length === 0 && report.trim()) {
      sections = [report];
    }

    sections.forEach((section, idx) => {
      const lines = section.split('\n').filter(Boolean);
      if (lines.length < 1) return;
      const title = lines[0].trim().replace(/^[#\s]*/, '');
      let reason = '';
      let original = '';
      let suggestion = '';

      for (const line of lines) {
        // 支持 bullet lines: - /* / 数字编号开头
        const bulletMatch = line.match(/^[-*\d、.]+\s*/);
        const cleanLine = bulletMatch ? line.slice(bulletMatch[0].length) : line;
        // 去掉 markdown 加粗标记 **
        const strippedLine = cleanLine.replace(/\*\*/g, '');
        const trimmed = strippedLine.trim();

        // 跳过空行和纯标题行
        if (!trimmed) continue;
        if (/^(---|___|\*\*\*)$/.test(trimmed)) continue;

        if (/^建议[：:]\s*/.test(trimmed) || /^修改[：:]\s*/.test(trimmed) || /^改为[：:]\s*/.test(trimmed)) {
          suggestion = trimmed.replace(/^(建议|修改|改为)[：:]*\s*/, '');
        } else if (/^原文[：:]\s*/.test(trimmed) || /^问题[：:]\s*/.test(trimmed) || /^原文内容[：:]\s*/.test(trimmed)) {
          original = trimmed.replace(/^(原文|问题|原文内容)[：:]*\s*/, '');
        } else if (/^原因[：:]\s*/.test(trimmed)) {
          reason = trimmed.replace(/^原因[：:]*\s*/, '');
        } else if (/^说明[：:]\s*/.test(trimmed) || /^描述[：:]\s*/.test(trimmed) || /^分析[：:]\s*/.test(trimmed)) {
          if (!reason) reason = trimmed.replace(/^(说明|描述|分析)[：:]*\s*/, '');
        } else {
          // 非标题行：追加到当前正在收集的字段
          if (suggestion && !original && !reason) {
            suggestion += '\n' + trimmed;
          } else if (reason && !original && !suggestion) {
            reason += '\n' + trimmed;
          } else if (original && !suggestion) {
            original += '\n' + trimmed;
          } else if (suggestion) {
            suggestion += '\n' + trimmed;
          }
        }
      }

      if (reason || original || suggestion) {
        items.push({
          id: `check-${idx}`,
          type: types[idx % types.length],
          reason: reason || title,
          original: original || title,
          suggestion: suggestion || title,
        });
      }
    });

    return items;
  };

  const handleSelfCheck = async () => {
    const latestContent = chapterDetail?.latestVersion?.content || editorContent;
    if (!latestContent) {
      setSelfCheckReport('暂无正文内容，无法自检');
      return;
    }
    setSelfCheckGenerating(true);
    setSelfCheckReport('');
    setSelfCheckItems([]);
    try {
      const result = await utils.client.analysis.start.mutate({
        projectId,
        chapterId,
        type: 'self_check',
        editorContent: latestContent,
      });
      setCurrentAnalysisId(result.analysisId);
      setIsThinkingModel(result.isThinking);
      startPolling(result.analysisId);
    } catch (err: unknown) {
      setSelfCheckReport(err instanceof Error ? err.message : '发起分析失败');
      setSelfCheckGenerating(false);
    }
  };


  // Modify step: apply modified content with green breathing animation
  const handleModificationsApplied = useCallback((modifiedPlainText: string, _modifiedTexts: string[]) => {
    // modifiedPlainText 中已包含 \uE000...\uE001 标记
    // 先转 HTML，标记会保留（不会被 escapeHtml 影响）
    const html = formatChapterContent(modifiedPlainText);

    // 替换 Unicode 标记为高亮 span
    const highlightedHtml = html
      .replace(/\uE000/g, '<span class="mod-highlight">')
      .replace(/\uE001/g, '</span>');

    // Set modified content (独立于草稿编辑器，不覆盖开始创作的内容)
    setModifiedContent(highlightedHtml);
    setModifyHighlightTexts([]);

    // Remove highlights after 5 seconds (提示修改位置)
    setTimeout(() => {
      setModifiedContent(prev => {
        const cleaned = prev.replace(/<span class="mod-highlight">([\s\S]*?)<\/span>/g, '$1');
        return cleaned;
      });
      setModifyHighlightTexts([]);
    }, 5000);
  }, []);

  const handleNavigateToModify = useCallback(() => {
    setActiveTab('modify');
    setAutoModify(true);
  }, []);

  const tabs: { key: TabKey; label: string; step: string }[] = [
    { key: 'brief', label: '任务书', step: '01' },
    { key: 'draft', label: '开始创作', step: '02' },
    { key: 'checklist', label: 'AI自检', step: '03' },
    { key: 'modify', label: 'AI修改', step: '04' },
    { key: 'finalize', label: '定稿总结经验', step: '05' },
  ];

  if (detailLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-400">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex">
      {/* 修改高亮动画 CSS */}
      <style>{`
        @keyframes modHighlightPulse {
          0% { background-color: #bbf7d0; color: #166534; }
          25% { background-color: #86efad; color: #166534; }
          50% { background-color: #bbf7d0; color: #166534; }
          75% { background-color: #86efad; color: #166534; }
          100% { background-color: transparent; color: inherit; }
        }
        .mod-highlight {
          animation: modHighlightPulse 3s ease-in-out;
          border-radius: 3px;
          padding: 1px 2px;
        }
      `}</style>
      <ProjectSidebar
        projectId={projectId}
        projectName={projectData?.name || '项目'}
        projectGenre={projectData?.genre}
        projectStyle={projectData?.style}
        currentPath="/chapters"
        progress={progress}
      />

      {/* 大纲目录树 — 紧贴 ProjectSidebar */}
      <OutlineSidebar
        projectId={projectId}
        currentChapterId={chapterId}
        embedded
      />

      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/dashboard" className="hover:text-gray-900 transition">项目列表</Link>
            <span className="text-gray-300">/</span>
            <Link href={`/project/${projectId}`} className="hover:text-gray-900 transition">概览</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">{chapter?.title || '章节'}</span>
            {isFinalized && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full ml-1">已定稿</span>}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold">{chapter?.title || '加载中...'}</h1>
              {volume && unit && (
                <p className="text-xs text-gray-400">{volume.title} / {unit.title}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setExperiencePanelOpen(true)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:border-gray-500 transition">
                经验管理
              </button>
              <button onClick={() => setWritingStyleOpen(true)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:border-gray-500 transition">
                写作风格
              </button>
              <button onClick={handleExportCurrentChapter}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:border-gray-500 transition">
                导出正文
              </button>
              <button onClick={() => setVersionPanelOpen(true)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:border-gray-500 transition">
                版本管理
              </button>
              <button onClick={() => setChatOpen(true)}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                AI 创作
              </button>
            </div>
          </div>
        </div>

        {/* R9: 如果章节还未创建梗概，提示用户回到大纲编辑 */}
        {chapter && !chapter.synopsis && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
            <p className="text-sm text-amber-800">
              还未创建章节梗概，请回到
              <Link href={`/project/${projectId}/outline`} className="text-amber-900 font-bold hover:underline mx-1">大纲编辑</Link>
              与AI对话，从卷、单元、章节一步步深入创建梗概，我将根据章节梗概内容，自动为您撰写章节正文。
            </p>
          </div>
        )}

        {/* Step Bar — 居中大按钮 */}
        <div className="border-b border-gray-200">
          <div className="flex items-center justify-center gap-0 py-0">
            {tabs.map((tab, idx) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-8 py-3.5 text-sm font-medium border-b-2 transition ${
                  activeTab === tab.key
                    ? 'border-gray-900 text-gray-900 bg-gray-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  activeTab === tab.key
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}>{tab.step}</span>
                {tab.label}
                {idx < tabs.length - 1 && (
                  <span className="text-gray-300 text-xs ml-4 hidden md:inline">→</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content — full-width, no gray margins */}
        <div className="flex-1 overflow-y-auto">
          {/* Tab: 任务书 */}
          {activeTab === 'brief' && (
            <div className="max-w-4xl mx-auto px-6 py-6">
              {/* 创作风格入口 */}
              {!briefConfirmed && (
                <div className="mb-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-5">
                  <p className="text-sm font-medium text-amber-800 mb-2">写作风格提示</p>
                  <p className="text-xs text-amber-600 mb-1">在开始创作前，建议先设置写作风格，让AI生成的内容更符合您的预期</p>
                  <p className="text-xs text-amber-600 mb-3">AI将根据您的要求或导入的模板、文件，进行三段试写，以便您确认心仪的方向</p>
                  <button onClick={() => setWritingStyleOpen(true)}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition">
                    设置写作风格
                  </button>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">创作任务书</h2>
                  {briefConfirmed && <span className="text-xs text-green-600 font-medium">已确认</span>}
                </div>
                {briefLoading ? (
                  <p className="text-sm text-gray-400">生成任务书中...</p>
                ) : (
                  <div>
                    <textarea
                      value={editableBrief}
                      onChange={e => { setEditableBrief(e.target.value); setBriefConfirmed(false); }}
                      className="w-full h-96 p-4 text-sm bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 font-mono leading-relaxed"
                    />
                    {taskBriefData && (
                      <div className="flex items-center gap-4 text-xs text-gray-400 mt-3">
                        <span>相关设定：{taskBriefData.settingCount} 条</span>
                        <span>前情章节：{taskBriefData.prevChapters.length} 章</span>
                        <span>字数：{wordCount}</span>
                      </div>
                    )}
                    {!briefConfirmed && (
                      <button onClick={() => {
                        setBriefConfirmed(true);
                        setActiveTab('draft');
                        setChatOpen(true);
                      }}
                        className="w-full mt-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                        确认任务书，开始创作
                      </button>
                    )}
                    {briefConfirmed && (
                      <p className="text-xs text-green-600 mt-3">任务书已确认，进入下一步开始创作</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab: 开始创作 */}
          {activeTab === 'draft' && (
            <div className="h-full flex flex-col">
              <div className="flex-1 flex flex-col border-b border-gray-200">
                <StoryEditor
                  content={editorContent}
                  onChange={setEditorContent}
                  placeholder="开始创作..."
                  editable={true}
                />
              </div>
              <div className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>字数：{wordCount}</span>
                  {isFinalized && <span className="text-green-600 font-medium">已定稿（可重新编辑）</span>}
                </div>
                <div className="flex items-center gap-3">
                  {saveStatus === 'saved' && <span className="text-xs text-green-600 font-medium">已保存</span>}
                  {saveStatus === 'saving' && <span className="text-xs text-gray-400">保存中...</span>}
                  {!isFinalized && (
                    <>
                      <button onClick={() => setChatOpen(true)}
                        className="px-5 py-2.5 border-2 border-gray-300 rounded-lg text-sm font-medium hover:border-gray-500 transition">
                        AI 生成
                      </button>
                      <button onClick={handleSaveDraft} disabled={saveStatus === 'saving' || !editorContent.trim()}
                        className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                        保存草稿
                      </button>
                    </>
                  )}
                  {isFinalized && (
                    <>
                      <button onClick={() => setChatOpen(true)}
                        className="px-5 py-2.5 border-2 border-gray-300 rounded-lg text-sm font-medium hover:border-gray-500 transition">
                        AI 生成
                      </button>
                      <button onClick={handleSaveDraft} disabled={saveStatus === 'saving' || !editorContent.trim()}
                        className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                        保存修改
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab: AI 自检 */}
          {activeTab === 'checklist' && (
            <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
              {!selfCheckReport && !selfCheckGenerating && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="font-semibold mb-4">AI 自检报告</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    AI 将自动分析本章正文，检查标题与梗概一致性、人物一致性、设定一致性、
                    伏笔与逻辑、节奏与结构、文字质量等方面，生成详细的修改建议。
                  </p>
                  <button onClick={handleSelfCheck}
                    disabled={selfCheckGenerating}
                    className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed">
                    {selfCheckGenerating
                      ? (isThinkingModel ? 'AI将进行详细自检，thinking模型需要一些时间，请耐心等候。您可以根据质量要求选择合适模型。'
                        : 'AI正在思考中，请稍候...')
                      : '开始自检'}
                  </button>
                </div>
              )}

              {/* Resume dialog for recovered analysis */}
              {showResumeDialog && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                    <span className="text-sm text-amber-800">检测到进行中的分析任务，正在恢复...</span>
                  </div>
                  <span className="text-xs text-amber-600">进度: {analysisProgress}%</span>
                </div>
              )}

              {/* Completed notification */}
              {showCompletedNotification && !showResumeDialog && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-green-600 font-bold">&#10003;</span>
                    <span className="text-sm text-green-800">有已完成的分析报告，点击&quot;开始自检&quot;查看</span>
                  </div>
                  <button onClick={() => {
                    setShowCompletedNotification(null);
                    // Mark as dismissed
                    utils.client.analysis.dismiss.mutate({ analysisId: showCompletedNotification }).catch(() => {});
                  }}
                    className="text-xs text-gray-500 hover:text-gray-700">
                    关闭
                  </button>
                </div>
              )}

              <SelfCheckPanel
                report={selfCheckReport || ''}
                generating={selfCheckGenerating}
                items={selfCheckItems}
                onRetry={handleSelfCheck}
                onNavigateToModify={handleNavigateToModify}
                isThinking={isThinkingModel}
              />
            </div>
          )}

          {/* Tab: 修改 */}
          {activeTab === 'modify' && (
            modifiedContent ? (
              // 修改应用后：全页编辑器
              <div className="h-full flex flex-col">
                <ModifyPanel
                  chapterContent={chapterDetail?.latestVersion?.content || editorContent}
                  selfCheckItems={selfCheckItems}
                  rawReport={selfCheckReport || undefined}
                  configId={configs?.[0]?.id || ''}
                  projectId={projectId}
                  autoGenerate={autoModify && !!selfCheckReport && !!configs?.[0]?.id}
                  showEditor={true}
                  editorContent={modifiedContent}
                  onEditorChange={setModifiedContent}
                  onModificationsApplied={(...args) => {
                    handleModificationsApplied(...args);
                    setAutoModify(false);
                  }}
                  onNavigateToFinalize={() => setActiveTab('finalize')}
                  onRetry={() => setModifiedContent('')}
                  onSaveModificationResult={(content, summary) => {
                    saveModificationMutation.mutate({ projectId, chapterId, modificationContent: content, modificationSummary: summary });
                  }}
                />
              </div>
            ) : (
              <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
                {selfCheckItems.length === 0 && !selfCheckReport ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
                    <p className="text-sm text-gray-500 mb-4">暂无自检结果，请先完成 AI 自检步骤</p>
                    <button onClick={() => setActiveTab('checklist')}
                      className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                      前往 AI 自检
                    </button>
                  </div>
                ) : (
                  <>
                    {/* 自检报告概要（折叠） */}
                    {selfCheckReport && (
                      <details className="bg-white rounded-xl border border-gray-200 p-4">
                        <summary className="text-sm font-medium cursor-pointer select-none">
                          自检报告{selfCheckItems.length > 0 ? `（共 ${selfCheckItems.length} 条建议）` : ''}
                        </summary>
                        <pre className="mt-3 whitespace-pre-wrap text-xs text-gray-600 bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                          {selfCheckReport}
                        </pre>
                      </details>
                    )}

                    <ModifyPanel
                      chapterContent={chapterDetail?.latestVersion?.content || editorContent}
                      selfCheckItems={selfCheckItems}
                      rawReport={selfCheckReport || undefined}
                      configId={configs?.[0]?.id || ''}
                      projectId={projectId}
                      autoGenerate={autoModify && !!selfCheckReport && !!configs?.[0]?.id}
                      showEditor={true}
                      editorContent={modifiedContent}
                      onEditorChange={setModifiedContent}
                      onModificationsApplied={(...args) => {
                        handleModificationsApplied(...args);
                        setAutoModify(false);
                      }}
                      onNavigateToFinalize={() => setActiveTab('finalize')}
                      onRetry={() => setModifiedContent('')}
                      onSaveModificationResult={(content, summary) => {
                        saveModificationMutation.mutate({ projectId, chapterId, modificationContent: content, modificationSummary: summary });
                      }}
                    />
                  </>
                )}
              </div>
            )
          )}

          {/* Tab: 定稿 */}
          {activeTab === 'finalize' && (
            <FinalizePanel
              chapterId={chapterId}
              projectId={projectId}
              chapterTitle={chapter?.title || ''}
              wordCount={wordCount}
              isFinalized={isFinalized || false}
              currentVersionNumber={currentVersion?.versionNumber || 0}
              editorContent={editorContent}
              onFinalize={handleFinalize}
              saveStatus={saveStatus}
            />
          )}
        </div>
      </main>

      {/* Version Panel (slide-out) */}
      <VersionPanel
        open={versionPanelOpen}
        onClose={() => setVersionPanelOpen(false)}
        chapterId={chapterId}
        projectId={projectId}
        onLoadVersion={handleLoadVersion}
      />

      {/* Experience Panel (slide-out) */}
      <ExperiencePanel
        open={experiencePanelOpen}
        onClose={() => setExperiencePanelOpen(false)}
        projectId={projectId}
      />

      {/* Writing Style Panel (modal) */}
      <WritingStylePanel
        open={writingStyleOpen}
        onClose={() => setWritingStyleOpen(false)}
        projectId={projectId}
      />

      {/* AI Chat Panel */}
      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        projectId={projectId}
        conversationType="chapter"
        roleKey="writer"
        title={`AI 创作 — ${volume?.title || ''} / ${unit?.title || ''} / ${chapter?.title || ''}`}
        targetEntityId={chapterId}
        taskBrief={editableBrief}
        onSaveDraft={(content) => {
          const formatted = formatChapterContent(content);
          setEditorContent(formatted);
          setActiveTab('draft');
          setChatOpen(false);
          // R3c: 自动持久化到DB
          saveChapterMutation.mutate({
            chapterId,
            content: formatted,
            versionLabel: `草稿 v${(currentVersion?.versionNumber || 0) + 1}`,
            isFinal: false,
            wordCount: formatted.replace(/\s/g, '').length,
          });
        }}
        onActionConfirmed={() => {
          utils.workflow.getChapterDetail.invalidate({ chapterId });
        }}
      />
    </div>
  );
}
