'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { useWorkflowProgress } from '@/lib/use-workflow-progress';
import { ProjectSidebar } from '@/components/layout/project-sidebar';

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: project, isLoading } = trpc.project.get.useQuery({ id });
  const { data: stats } = trpc.project.getProjectStats.useQuery({ projectId: id });
  const progress = useWorkflowProgress(id);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [shouldFlash, setShouldFlash] = useState(false);

  useEffect(() => {
    const key = `storyedit_welcome_${id}`;
    if (localStorage.getItem(key)) setWelcomeDismissed(true);
  }, [id]);

  const dismissWelcome = () => {
    localStorage.setItem(`storyedit_welcome_${id}`, '1');
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

  // 大纲编辑闪烁仅首次进入时生效，之后不再闪烁
  const isNewProject = !progress.hasVolumes && !progress.hasChapters && progress.settingCount === 0;
  useEffect(() => {
    const key = `storyedit_flash_${id}`;
    if (isNewProject && !localStorage.getItem(key)) {
      setShouldFlash(true);
      localStorage.setItem(key, '1');
    }
  }, [isNewProject, id]);

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">加载中...</div>;
  }

  const showWelcome = isNewProject && !welcomeDismissed && !progress.isLoading;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <ProjectSidebar
        projectId={id}
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
                <p className="text-sm text-gray-500 mt-0.5">按照 大纲编辑 → 设定管理 → 正文创作 的顺序，AI 将协助您完成创作。</p>
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

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">项目概览</h1>
          <Link href="/help"
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            操作步骤提示
          </Link>
        </div>
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
            <Link href={`/project/${id}/chapter/${stats.recentChapter.id}`}
              className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
              继续编辑
            </Link>
          </div>
        )}

        {/* 我的模板和AI助手 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Link href={`/project/${id}/templates`}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-400 transition text-center">
            <p className="text-sm font-medium text-gray-900">我的模板</p>
            <p className="text-xs text-gray-400 mt-1">管理写作风格和内容模板</p>
          </Link>
          <Link href={`/project/${id}/agents`}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-400 transition text-center">
            <p className="text-sm font-medium text-gray-900">AI 助手</p>
            <p className="text-xs text-gray-400 mt-1">配置和管理 AI 创作助手</p>
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-center text-gray-800 mb-6">AI协作，开始创作之旅</h2>
          <div className="grid grid-cols-3 gap-6">
            <Link href={`/project/${id}/outline`}
              className={`group rounded-xl border-2 p-8 text-center hover:border-gray-900 hover:shadow-lg transition-all duration-200 relative ${progress.hasChapters ? 'border-gray-300 bg-gray-50/50' : progress.hasVolumes ? 'border-gray-200 bg-gray-50' : 'border-gray-200 animate-cta-pulse'} ${shouldFlash ? 'animate-amber-flash' : ''}`}>
              <span className="absolute -top-3 -left-3 px-2.5 py-1 bg-gray-900 text-white text-xs font-bold rounded-full shadow-md">第1步</span>
              <p className="text-2xl font-bold text-gray-900 mb-3">大纲编辑</p>
              <p className="text-sm text-gray-400">后续AI创作依赖梗概，请先完成至少2个章节梗概</p>
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
            <Link href={`/project/${id}/settings`}
              className={`group rounded-xl border-2 p-8 text-center hover:border-gray-900 hover:shadow-lg transition-all duration-200 relative ${progress.settingComplete ? 'border-gray-300 bg-gray-50/50' : progress.settingCount > 0 && !progress.hasChapters ? 'border-gray-200 bg-gray-50 animate-cta-pulse' : 'border-gray-200'}`} style={{ animationDelay: progress.settingComplete ? '0s' : '0.6s' }}>
              <span className="absolute -top-3 -left-3 px-2.5 py-1 bg-gray-900 text-white text-xs font-bold rounded-full shadow-md">第2步</span>
              <p className="text-2xl font-bold text-gray-900 mb-3">设定管理</p>
              <p className="text-sm text-gray-400">根据全书简介自动生成基础设定</p>
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
            <Link href={stats?.recentChapter ? `/project/${id}/chapter/${stats.recentChapter.id}` : stats?.firstChapter ? `/project/${id}/chapter/${stats.firstChapter.id}` : progress.hasChapters ? `/project/${id}/chapters` : `/project/${id}/outline`}
              className={`group rounded-xl border-2 p-8 text-center hover:border-gray-900 hover:shadow-lg transition-all duration-200 relative ${progress.chapterFinal > 0 || progress.chapterDraft > 0 ? 'border-gray-300 bg-gray-50/50' : progress.hasChapters ? 'border-gray-200 bg-gray-50 animate-cta-pulse' : 'border-gray-200'}`} style={{ animationDelay: '1.2s' }}>
              <span className="absolute -top-3 -left-3 px-2.5 py-1 bg-gray-900 text-white text-xs font-bold rounded-full shadow-md">第3步</span>
              <p className="text-2xl font-bold text-gray-900 mb-3">正文创作</p>
              <p className="text-sm text-gray-400">自动读取章节上下文创作，创作经验持续总结</p>
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
