'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { useWorkflowProgress } from '@/lib/use-workflow-progress';
import { ProjectSidebar } from '@/components/layout/project-sidebar';

export default function ProjectPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data: project, isLoading } = trpc.project.get.useQuery({ id: params.id });
  const { data: stats } = trpc.project.getProjectStats.useQuery({ projectId: params.id });
  const progress = useWorkflowProgress(params.id);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  useEffect(() => {
    const key = `storyedit_welcome_${params.id}`;
    if (localStorage.getItem(key)) setWelcomeDismissed(true);
  }, [params.id]);

  const dismissWelcome = () => {
    localStorage.setItem(`storyedit_welcome_${params.id}`, '1');
    setWelcomeDismissed(true);
  };

  const deleteMutation = trpc.project.delete.useMutation({
    onSuccess: () => router.push('/dashboard'),
  });

  // 监听工作流步骤完成事件以刷新进度
  useEffect(() => {
    const handler = () => progress.refetch();
    window.addEventListener('workflow-step-completed', handler);
    return () => window.removeEventListener('workflow-step-completed', handler);
  }, [progress]);

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">加载中...</div>;
  }

  const isNewProject = !progress.hasVolumes && !progress.hasChapters && progress.settingCount === 0;
  const showWelcome = isNewProject && !welcomeDismissed && !progress.isLoading;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <ProjectSidebar
        projectId={params.id}
        projectName={project?.name || '项目'}
        projectGenre={project?.genre}
        projectStyle={project?.style}
        currentPath=""
        progress={progress}
      />

      <main className="flex-1 p-8">
        {/* 欢迎横幅（空项目首次进入） */}
        {showWelcome && (
          <div className="mb-6 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎉</span>
              <div>
                <p className="font-semibold text-gray-900">欢迎开始创作之旅！</p>
                <p className="text-sm text-gray-500 mt-0.5">按照 大纲编辑 → 设定管理 → 正文创作 的顺序，AI 将全程协助你完成创作。</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/help"
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                查看引导
              </Link>
              <button onClick={dismissWelcome}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition">
                稍后再说
              </button>
            </div>
          </div>
        )}

        <h1 className="text-2xl font-bold mb-6">项目概览</h1>
        <div className="grid grid-cols-4 gap-4 mb-4" data-guide-target="overview-stats">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">卷 / 单元 / 章节</p>
            <p className="text-xl font-bold mt-1">{stats?.volumeCount ?? 0} / {stats?.unitCount ?? 0} / {stats?.chapterCount ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">总字数</p>
            <p className="text-xl font-bold mt-1">{(stats?.totalWords ?? 0).toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">创作进度</p>
            <p className="text-xl font-bold mt-1">
              <span className="text-gray-700">{stats?.finalCount ?? 0}</span>
              <span className="text-gray-400 text-sm font-normal"> 定稿 / </span>
              <span className="text-yellow-600">{stats?.draftCount ?? 0}</span>
              <span className="text-gray-400 text-sm font-normal"> 草稿</span>
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">设定词条</p>
            <p className="text-xl font-bold mt-1">{stats?.settingCount ?? 0}</p>
          </div>
        </div>

        {stats?.recentChapter && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">最近编辑</p>
              <p className="font-medium mt-0.5">{stats.recentChapter.title}</p>
            </div>
            <Link href={`/project/${params.id}/chapter/${stats.recentChapter.id}`}
              className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
              继续编辑
            </Link>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-center text-gray-800 mb-6">AI协作，开始创作之旅</h2>
          <div className="grid grid-cols-3 gap-6">
            <Link href={`/project/${params.id}/outline`}
              className={`group rounded-xl border-2 p-8 text-center hover:border-gray-900 hover:shadow-lg transition-all duration-200 ${progress.hasChapters ? 'border-gray-300 bg-gray-50/50' : progress.hasVolumes ? 'border-gray-200 bg-gray-50' : 'border-gray-200 animate-cta-pulse'}`}>
              <p className="text-2xl font-bold text-gray-900 mb-3">大纲编辑</p>
              <p className="text-sm text-gray-400">构思和调整故事结构</p>
              <div className="mt-3">
                {progress.hasChapters ? (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-600 font-medium">
                    <span className="text-gray-500">✓</span> 已完成
                  </span>
                ) : progress.hasVolumes ? (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-600 font-medium">
                    进行中
                  </span>
                ) : (
                  <span className="inline-block text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">开始 →</span>
                )}
              </div>
            </Link>
            <Link href={`/project/${params.id}/settings`}
              className={`group rounded-xl border-2 p-8 text-center hover:border-gray-900 hover:shadow-lg transition-all duration-200 ${progress.settingComplete ? 'border-gray-300 bg-gray-50/50' : progress.settingCount > 0 && !progress.hasChapters ? 'border-gray-200 bg-gray-50 animate-cta-pulse' : 'border-gray-200'}`} style={{ animationDelay: progress.settingComplete ? '0s' : '0.6s' }}>
              <p className="text-2xl font-bold text-gray-900 mb-3">设定管理</p>
              <p className="text-sm text-gray-400">人物、世界观、力量体系</p>
              <div className="mt-3">
                {progress.settingComplete ? (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-600 font-medium">
                    <span className="text-gray-500">✓</span> 已完成
                  </span>
                ) : progress.settingCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-600 font-medium">
                    进行中 ({progress.settingCount}/10)
                  </span>
                ) : (
                  <span className="inline-block text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">开始 →</span>
                )}
              </div>
            </Link>
            <Link href={stats?.recentChapter ? `/project/${params.id}/chapter/${stats.recentChapter.id}` : progress.hasChapters ? `/project/${params.id}/outline` : `/project/${params.id}/chapters`}
              className={`group rounded-xl border-2 p-8 text-center hover:border-gray-900 hover:shadow-lg transition-all duration-200 ${progress.chapterFinal > 0 || progress.chapterDraft > 0 ? 'border-gray-300 bg-gray-50/50' : progress.hasChapters ? 'border-gray-200 bg-gray-50 animate-cta-pulse' : 'border-gray-200'}`} style={{ animationDelay: '1.2s' }}>
              <p className="text-2xl font-bold text-gray-900 mb-3">正文创作</p>
              <p className="text-sm text-gray-400">从大纲进入章节编辑</p>
              <div className="mt-3">
                {progress.chapterFinal > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-600 font-medium">
                    <span className="text-gray-500">✓</span> 已定稿 {progress.chapterFinal} 章
                  </span>
                ) : progress.chapterDraft > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-600 font-medium">
                    进行中 ({progress.chapterDraft} 草稿)
                  </span>
                ) : progress.hasChapters ? (
                  <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-medium">
                    就绪
                  </span>
                ) : (
                  <span className="inline-block text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">开始 →</span>
                )}
              </div>
            </Link>
          </div>
        </div>

      </main>
    </div>
  );
}
