'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { streamAiChat } from '@/lib/ai-stream';
import { StoryEditor } from '@/components/editor/story-editor';
import { VersionPanel } from '@/components/version/version-panel';
import { ChatPanel } from '@/components/chat/chat-panel';
import { WritingStylePanel } from '@/components/chapter/writing-style-panel';
import { SelfCheckPanel, type CheckItem } from '@/components/chapter/self-check-panel';
import { FinalizePanel } from '@/components/chapter/finalize-panel';
import { OutlineSidebar } from '@/components/chapter/outline-sidebar';
import { useWorkflowProgress } from '@/lib/use-workflow-progress';
import { ProjectSidebar } from '@/components/layout/project-sidebar';

type TabKey = 'brief' | 'draft' | 'checklist' | 'finalize';

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

  // Self-check state
  const [selfCheckReport, setSelfCheckReport] = useState<string | null>(null);
  const [selfCheckGenerating, setSelfCheckGenerating] = useState(false);
  const [selfCheckItems, setSelfCheckItems] = useState<CheckItem[]>([]);

  // Panel state
  const [versionPanelOpen, setVersionPanelOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [writingStyleOpen, setWritingStyleOpen] = useState(false);

  // Get AI configs for self-check
  const { data: configs } = trpc.ai.listConfigs.useQuery(undefined, { enabled: activeTab === 'checklist' || activeTab === 'finalize' });

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

  // Set editable brief when data loads
  useEffect(() => {
    if (taskBriefData?.brief && !editableBrief && !briefConfirmed) {
      setEditableBrief(taskBriefData.brief);
    }
  }, [taskBriefData?.brief, editableBrief, briefConfirmed]);

  // Set editor content when chapter detail loads
  useEffect(() => {
    if (chapterDetail?.latestVersion?.content && !editorContent) {
      setEditorContent(chapterDetail.latestVersion.content);
    }
  }, [chapterDetail?.latestVersion?.content, editorContent]);

  // Listen for workflow step completion events
  useEffect(() => {
    const handler = () => progress.refetch();
    window.addEventListener('workflow-step-completed', handler);
    return () => window.removeEventListener('workflow-step-completed', handler);
  }, [progress]);

  const chapter = chapterDetail?.chapter;
  const unit = chapterDetail?.unit;
  const volume = chapterDetail?.volume;
  const currentVersion = chapterDetail?.latestVersion;
  const isFinalized = currentVersion?.isFinal;
  const wordCount = currentVersion?.wordCount || editorContent.replace(/\s/g, '').length;

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

  // Self-check: parse report into structured items
  const parseCheckItems = (report: string): CheckItem[] => {
    const items: CheckItem[] = [];
    const sections = report.split(/### |## /).filter(Boolean);
    const types: CheckItem['type'][] = ['consistency', 'character', 'setting', 'logic', 'pacing', 'quality'];

    sections.forEach((section, idx) => {
      const lines = section.split('\n').filter(Boolean);
      if (lines.length < 2) return;
      const title = lines[0].trim();
      // Extract reason, original, suggestion
      let reason = '';
      let original = '';
      let suggestion = '';
      let current = '';

      for (const line of lines) {
        if (line.startsWith('- ') || line.startsWith('* ')) {
          if (line.includes('建议') || line.includes('修改')) {
            suggestion = line.replace(/^[-*]\s*(建议|修改)[：:]\s*/, '');
          } else if (line.includes('原文') || line.includes('问题')) {
            original = line.replace(/^[-*]\s*(原文|问题)[：:]\s*/, '');
          } else if (line.includes('原因')) {
            reason = line.replace(/^[-*]\s*原因[：:]\s*/, '');
          }
          if (!current) current = line;
        } else if (current) {
          current += ' ' + line;
        }
      }

      if (reason || original || suggestion) {
        items.push({
          id: `check-${idx}`,
          type: types[idx % types.length],
          reason: reason || title,
          original: original || current,
          suggestion: suggestion || title,
        });
      }
    });

    return items;
  };

  const handleSelfCheck = async () => {
    if (!configs || configs.length === 0) {
      setSelfCheckReport('请先配置 AI 模型');
      return;
    }
    const latestContent = chapterDetail?.latestVersion?.content || editorContent;
    if (!latestContent) {
      setSelfCheckReport('暂无正文内容，无法自检');
      return;
    }
    setSelfCheckGenerating(true);
    setSelfCheckReport('');
    setSelfCheckItems([]);
    try {
      const systemMsg = { role: 'system' as const, content: '你是一名专业的文学编辑和质量审核员。请对小说正文进行全面的自检，找出需要修改的问题。输出格式清晰的自检报告，每项包含：原因、原文、修改建议。' };
      const checkPrompt = taskBriefData?.checkPrompt || `请对以下正文进行自检：\n\n${latestContent.slice(0, 8000)}`;
      const userMsg = { role: 'user' as const, content: checkPrompt };
      let fullReport = '';
      for await (const chunk of streamAiChat({
        configId: configs[0].id,
        messages: [systemMsg, userMsg],
        projectId,
      })) {
        if (chunk.error) {
          setSelfCheckReport(`自检出错：${chunk.error}`);
          break;
        }
        if (chunk.content) {
          fullReport += chunk.content;
          setSelfCheckReport(fullReport);
        }
      }
      if (fullReport) {
        const items = parseCheckItems(fullReport);
        setSelfCheckItems(items);
      }
      if (!fullReport) {
        setSelfCheckReport('自检完成，未发现问题');
      }
    } catch {
      setSelfCheckReport('自检失败，请检查网络连接');
    }
    setSelfCheckGenerating(false);
  };

  const handleApplySuggestion = useCallback((suggestion: string) => {
    // Apply the suggestion to the editor
    setEditorContent(prev => {
      if (prev.includes(suggestion)) return prev;
      return prev + '\n\n[修改建议]: ' + suggestion;
    });
  }, []);

  const handleApplyAll = useCallback((suggestions: string[]) => {
    setEditorContent(prev => {
      const additions = suggestions.filter(s => !prev.includes(s));
      if (additions.length === 0) return prev;
      return prev + '\n\n[批量修改]:\n' + additions.join('\n');
    });
  }, []);

  const tabs = [
    { key: 'brief' as TabKey, label: '任务书', icon: '📋' },
    { key: 'draft' as TabKey, label: '草稿', icon: '✍️' },
    { key: 'checklist' as TabKey, label: '自检', icon: '✓' },
    { key: 'finalize' as TabKey, label: '定稿', icon: '🎯' },
  ];

  if (detailLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
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
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/dashboard" className="hover:text-gray-900">项目列表</Link>
            <span className="text-gray-300">/</span>
            <Link href={`/project/${projectId}`} className="hover:text-gray-900">概览</Link>
            <span className="text-gray-300">/</span>
            <Link href={`/project/${projectId}/chapters`} className="hover:text-gray-900">正文</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">{chapter?.title || '章节'}</span>
            {isFinalized && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">已定稿</span>}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">{chapter?.title || '加载中...'}</h1>
              {volume && unit && (
                <p className="text-xs text-gray-400 mt-0.5">{volume.title} / {unit.title}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setWritingStyleOpen(true)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:border-gray-500 transition">
                写作风格
              </button>
              <button onClick={() => setVersionPanelOpen(true)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:border-gray-500 transition">
                版本管理
              </button>
              <button onClick={() => setChatOpen(true)}
                className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                AI 创作
              </button>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="bg-white border-b border-gray-200 px-6">
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                  activeTab === tab.key
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}>
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Tab: 任务书 */}
          {activeTab === 'brief' && (
            <div className="max-w-3xl mx-auto">
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
                      <button onClick={() => setBriefConfirmed(true)}
                        className="w-full mt-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                        确认任务书，开始创作
                      </button>
                    )}
                    {briefConfirmed && (
                      <p className="text-xs text-green-600 mt-3">任务书已确认，切换到"草稿"tab开始撰写正文</p>
                    )}
                  </div>
                )}
              </div>

              {/* AI 构思入口 */}
              {!briefConfirmed && (
                <div className="mt-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-5">
                  <p className="text-sm font-medium text-amber-800 mb-2">还没有创作思路？</p>
                  <p className="text-xs text-amber-600 mb-3">让 AI 根据你的设定和大纲，生成本章的任务书和草稿。</p>
                  <button onClick={() => setChatOpen(true)}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition">
                    AI 构思
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab: 草稿编辑器 */}
          {activeTab === 'draft' && (
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
                <StoryEditor
                  content={editorContent}
                  onChange={setEditorContent}
                  placeholder="开始创作..."
                  editable={!isFinalized}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>字数：{wordCount}</span>
                  {isFinalized && <span className="text-green-600 font-medium">已定稿，不可编辑</span>}
                </div>
                <div className="flex items-center gap-2">
                  {saveStatus === 'saved' && <span className="text-xs text-green-600">已保存</span>}
                  {saveStatus === 'saving' && <span className="text-xs text-gray-400">保存中...</span>}
                  {!isFinalized && (
                    <>
                      <button onClick={handleSaveDraft} disabled={saveStatus === 'saving' || !editorContent.trim()}
                        className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                        保存草稿
                      </button>
                      <button onClick={() => setChatOpen(true)}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-500 transition">
                        AI 生成
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab: AI 自检 */}
          {activeTab === 'checklist' && (
            <div className="max-w-3xl mx-auto space-y-4">
              {!selfCheckReport && !selfCheckGenerating && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="font-semibold mb-4">AI 自检报告</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    AI 将自动分析本章正文，检查标题与梗概一致性、人物一致性、设定一致性、
                    伏笔与逻辑、节奏与结构、文字质量等方面，生成详细的修改建议。
                  </p>
                  <button onClick={handleSelfCheck}
                    disabled={!configs || configs.length === 0}
                    className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed">
                    开始自检
                  </button>
                </div>
              )}

              <SelfCheckPanel
                report={selfCheckReport || ''}
                generating={selfCheckGenerating}
                items={selfCheckItems}
                onApplySuggestion={handleApplySuggestion}
                onApplyAll={handleApplyAll}
                onRetry={handleSelfCheck}
              />
            </div>
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
        title="AI 创作"
        taskBrief={editableBrief}
        onSaveDraft={(content) => {
          setEditorContent(content);
          setChatOpen(false);
        }}
        onActionConfirmed={() => {
          utils.workflow.getChapterDetail.invalidate({ chapterId });
        }}
      />
    </div>
  );
}
