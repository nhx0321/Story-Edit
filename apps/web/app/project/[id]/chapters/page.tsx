'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { useWorkflowProgress } from '@/lib/use-workflow-progress';
import { ProjectSidebar } from '@/components/layout/project-sidebar';
import { OutlineSidebar } from '@/components/chapter/outline-sidebar';
import { ChatPanel } from '@/components/chat/chat-panel';
import { WritingStylePanel } from '@/components/chapter/writing-style-panel';
import { ExperiencePanel } from '@/components/experience/experience-panel';

type TabKey = 'brief' | 'draft' | 'checklist' | 'modify' | 'finalize';

const TABS: { key: TabKey; label: string; step: string }[] = [
  { key: 'brief', label: '任务书', step: '01' },
  { key: 'draft', label: '开始创作', step: '02' },
  { key: 'checklist', label: 'AI自检', step: '03' },
  { key: 'modify', label: 'AI修改', step: '04' },
  { key: 'finalize', label: '定稿总结经验', step: '05' },
];

export default function ChaptersPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const progress = useWorkflowProgress(projectId);
  const { data: projectData } = trpc.project.get.useQuery({ id: projectId });
  const { data: stats } = trpc.project.getProjectStats.useQuery(
    { projectId },
    { enabled: progress.hasChapters },
  );

  // 自动跳转：优先未定稿章节 → 最近编辑 → 第一章
  useEffect(() => {
    if (stats?.firstUnfinished?.id) {
      router.replace(`/project/${projectId}/chapter/${stats.firstUnfinished.id}`);
    } else if (stats?.recentChapter?.id) {
      router.replace(`/project/${projectId}/chapter/${stats.recentChapter.id}`);
    } else if (stats?.firstChapter?.id) {
      router.replace(`/project/${projectId}/chapter/${stats.firstChapter.id}`);
    }
  }, [stats, projectId, router]);

  useEffect(() => {
    const handler = () => progress.refetch();
    window.addEventListener('workflow-step-completed', handler);
    return () => window.removeEventListener('workflow-step-completed', handler);
  }, [progress]);

  const [activeTab, setActiveTab] = useState<TabKey>('brief');
  const [expandedVolumes, setExpandedVolumes] = useState<Set<string>>(new Set());
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [chatOpen, setChatOpen] = useState(false);
  const [writingStyleOpen, setWritingStyleOpen] = useState(false);
  const [experiencePanelOpen, setExperiencePanelOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: volumeList, isLoading } = trpc.project.listVolumes.useQuery({ projectId });
  const hasChapters = volumeList && volumeList.length > 0;

  const toggleVolume = (id: string) => {
    const next = new Set(expandedVolumes);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedVolumes(next);
  };

  const toggleUnit = (id: string) => {
    const next = new Set(expandedUnits);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedUnits(next);
  };

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">加载中...</p></div>;
  }

  return (
    <div className="min-h-screen bg-white flex">
      <ProjectSidebar
        projectId={projectId}
        projectName={projectData?.name || '项目'}
        projectGenre={projectData?.genre}
        projectStyle={projectData?.style}
        currentPath="/chapters"
        progress={progress}
      />

      {/* 左侧大纲目录树 */}
      <OutlineSidebar
        projectId={projectId}
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
            <span className="text-gray-900 font-medium">正文创作</span>
            {progress.chapterFinal > 0 && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full ml-1">已定稿</span>}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold">正文创作</h1>
              <p className="text-xs text-gray-400">
                {hasChapters ? '选择下方章节开始创作' : '尚未创建章节，请先在大纲中完成规划'}
              </p>
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
              <button
                className="px-3 py-1.5 text-sm border border-gray-200 text-gray-300 rounded-lg cursor-not-allowed"
                title="请先选择章节">
                版本管理
              </button>
              <button onClick={() => setChatOpen(true)}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                AI 创作
              </button>
            </div>
          </div>
        </div>

        {/* 无章节梗概提示 */}
        {!hasChapters && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
            <p className="text-sm text-amber-800">
              还没有创建章节梗概，请先在大纲中规划结构，我将根据章节梗概制定正文创作任务
              <Link href={`/project/${projectId}/outline`} className="text-amber-900 font-bold hover:underline ml-2">前往大纲</Link>
            </p>
          </div>
        )}

        {/* Step Bar — 工作台标签栏 */}
        <div className="border-b border-gray-200">
          <div className="flex items-center justify-center gap-0 py-0">
            {TABS.map((tab, idx) => (
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
                {idx < TABS.length - 1 && (
                  <span className="text-gray-300 text-xs ml-4 hidden md:inline">→</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'brief' && (
            <div className="max-w-4xl mx-auto px-6 py-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="font-semibold mb-4">创作任务书</h2>
                {hasChapters ? (
                  <p className="text-sm text-gray-500">请从左侧大纲目录中选择一个章节，AI 将自动生成该章节的创作任务书。</p>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-sm">尚未创建章节，无法生成任务书</p>
                    <p className="text-xs mt-2">请先前往大纲编辑页面创建卷、单元、章节及对应梗概</p>
                    <Link href={`/project/${projectId}/outline`}
                      className="inline-block mt-3 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                      前往大纲编辑
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'draft' && (
            <div className="h-full flex flex-col">
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <p className="text-sm">选择章节后在此处开始创作正文</p>
                  <p className="text-xs mt-2">请从左侧大纲目录中点击章节进入创作工作台</p>
                </div>
              </div>
              <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200">
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>字数：0</span>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setChatOpen(true)}
                    className="px-5 py-2.5 border-2 border-gray-300 rounded-lg text-sm font-medium hover:border-gray-500 transition">
                    AI 生成
                  </button>
                  <button disabled
                    className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium opacity-50 cursor-not-allowed">
                    保存草稿
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'checklist' && (
            <div className="max-w-4xl mx-auto px-6 py-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="font-semibold mb-4">AI 自检</h2>
                {hasChapters ? (
                  <p className="text-sm text-gray-500">选择章节并完成初稿后，可在此进行 AI 自检，检查一致性、人物、设定、逻辑、节奏、文笔等维度。</p>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-sm">尚未创建章节，无法进行 AI 自检</p>
                    <p className="text-xs mt-2">请先在大纲中创建章节并完成正文初稿</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'modify' && (
            <div className="max-w-4xl mx-auto px-6 py-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="font-semibold mb-4">AI 修改</h2>
                {hasChapters ? (
                  <p className="text-sm text-gray-500">完成 AI 自检后，可在此根据自检报告对正文进行修改优化。</p>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-sm">尚未创建章节，无法进行 AI 修改</p>
                    <p className="text-xs mt-2">请先在大纲中创建章节并完成 AI 自检</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'finalize' && (
            <div className="max-w-4xl mx-auto px-6 py-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="font-semibold mb-4">定稿总结经验</h2>
                {hasChapters ? (
                  <p className="text-sm text-gray-500">完成修改后，可在此定稿并总结经验，为后续创作提供参考。</p>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-sm">尚未创建章节，无法定稿</p>
                    <p className="text-xs mt-2">请先在大纲中创建章节并完成正文修改</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 大纲目录列表（若已有卷，在主区域底部也展示） */}
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)}
        projectId={projectId} conversationType="chapter" roleKey="writer" title="AI 创作"
        onActionConfirmed={() => {
          utils.project.listVolumes.invalidate({ projectId });
          utils.project.listUnits.invalidate();
          utils.project.listChapters.invalidate();
        }} />

      <WritingStylePanel open={writingStyleOpen} onClose={() => setWritingStyleOpen(false)}
        projectId={projectId} />

      <ExperiencePanel open={experiencePanelOpen} onClose={() => setExperiencePanelOpen(false)}
        projectId={projectId} />
    </div>
  );
}

// Volume/Unit/Chapter components no longer needed here,
// they live in OutlineSidebar and chapter workspace
