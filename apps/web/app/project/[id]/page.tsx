'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

export default function ProjectPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data: project, isLoading } = trpc.project.get.useQuery({ id: params.id });
  const { data: stats } = trpc.project.getProjectStats.useQuery({ projectId: params.id });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const deleteMutation = trpc.project.delete.useMutation({
    onSuccess: () => router.push('/dashboard'),
  });

  const sidebarItems = [
    { href: '', label: '概览', icon: '□' },
    { href: '/outline', label: '大纲', icon: '≡' },
    { href: '/settings', label: '设定', icon: '▣' },
    { href: '/chapters', label: '正文', icon: '▤' },
    { href: '/templates', label: '模板', icon: '▦' },
    { href: '/agents', label: 'AI 助手', icon: '✦' },
  ];

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-56 bg-white border-r border-gray-200 p-4 flex flex-col" data-guide-target="project-sidebar">
        <div className="mb-6">
          <Link href="/dashboard" className="text-xs text-gray-400 hover:text-gray-600">&larr; 项目列表</Link>
          <h2 className="font-bold mt-2 truncate">{project?.name || '项目'}</h2>
          <p className="text-xs text-gray-500">{project?.genre} · {project?.style}</p>
        </div>
        <nav className="space-y-1 flex-1">
          {sidebarItems.map(item => (
            <Link key={item.label} href={`/project/${params.id}${item.href}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition">
              <span className="text-gray-400">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 pt-4 border-t border-gray-100">
          {showDeleteConfirm ? (
            <div className="space-y-2">
              <p className="text-xs text-red-500">确认删除此项目？</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { deleteMutation.mutate({ id: params.id }); }}
                  disabled={deleteMutation.isPending}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                >
                  确认删除
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full px-3 py-2 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition text-left"
            >
              删除项目
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 p-8">
        <h1 className="text-2xl font-bold mb-6">项目概览</h1>
        <div className="grid grid-cols-4 gap-4 mb-8" data-guide-target="overview-stats">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">卷 / 单元 / 章节</p>
            <p className="text-2xl font-bold mt-1">{stats?.volumeCount ?? 0} / {stats?.unitCount ?? 0} / {stats?.chapterCount ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">总字数</p>
            <p className="text-2xl font-bold mt-1">{(stats?.totalWords ?? 0).toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">创作进度</p>
            <p className="text-2xl font-bold mt-1">
              <span className="text-green-600">{stats?.finalCount ?? 0}</span>
              <span className="text-gray-400 text-base font-normal"> 定稿 / </span>
              <span className="text-yellow-600">{stats?.draftCount ?? 0}</span>
              <span className="text-gray-400 text-base font-normal"> 草稿</span>
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">设定词条</p>
            <p className="text-2xl font-bold mt-1">{stats?.settingCount ?? 0}</p>
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

        <h2 className="font-semibold mb-3">快捷操作</h2>
        <div className="grid grid-cols-3 gap-3">
          <Link href={`/project/${params.id}/outline`}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-400 transition">
            <p className="font-medium">编辑大纲</p>
            <p className="text-sm text-gray-500 mt-1">构思和调整故事结构</p>
          </Link>
          <Link href={`/project/${params.id}/settings`}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-400 transition">
            <p className="font-medium">管理设定</p>
            <p className="text-sm text-gray-500 mt-1">人物、世界观、力量体系</p>
          </Link>
          <Link href={`/project/${params.id}/outline`}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-400 transition">
            <p className="font-medium">继续创作</p>
            <p className="text-sm text-gray-500 mt-1">从大纲进入章节编辑</p>
          </Link>
        </div>

        <div className="mt-6 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200 p-4 flex items-center justify-between">
          <div>
            <p className="font-medium">需要灵感？去模板广场看看</p>
            <p className="text-sm text-gray-500 mt-1">浏览创作方法论、参考作品、设定模板</p>
          </div>
          <Link href="/marketplace" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition shrink-0">
            浏览模板
          </Link>
        </div>
      </main>
    </div>
  );
}
