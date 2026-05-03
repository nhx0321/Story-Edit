'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { NotificationBell } from '@/components/notification-bell';
import { useAuthStore } from '@/lib/auth-store';
import { projectTypes, categoryData } from '@/lib/project-presets';
import { aiRolePresets, defaultRoles, getDefaultPrompts } from '@/lib/project-role-presets';

export default function DashboardPage() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const { data: projects, isLoading } = trpc.project.list.useQuery(undefined, { enabled: !!user });
  const { data: deletedProjects } = trpc.project.listDeleted.useQuery(undefined, { enabled: !!user });
  const { data: tokenAccount } = trpc.token.getAccount.useQuery(undefined, { enabled: !!user });
  const [form, setForm] = useState({ name: '', type: 'webnovel', category: '', genre: '' });
  const [error, setError] = useState('');

  const createProject = trpc.project.create.useMutation({
    onSuccess: (project) => {
      router.push(`/project/${project!.id}`);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const utils = trpc.useUtils();
  const deleteProject = trpc.project.delete.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      utils.project.listDeleted.invalidate();
    },
    onError: (err) => alert(err.message),
  });

  const handleDeleteProject = (e: React.MouseEvent, p: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`确定要将「${p.name}」移入回收站吗？\n回收站中的项目将在 30 天后自动永久删除。`)) {
      deleteProject.mutate({ id: p.id });
    }
  };

  // 根据项目类型获取二级类目和三级题材
  const currentCategories = useMemo(() => {
    return categoryData[form.type]?.categories || [];
  }, [form.type]);

  const handleCreate = () => {
    if (!form.name.trim()) { setError('请输入项目名称'); return; }
    if (!form.genre) { setError('请选择题材'); return; }
    setError('');

    const prompts = aiRolePresets[form.genre] || getDefaultPrompts(form.type);
    const genreLabel = currentCategories.flatMap(c => c.genres).find(g => g.code === form.genre)?.label || form.genre;

    const roleToPresetKey: Record<string, keyof typeof prompts> = {
      editor: 'editor',
      setting_editor: 'settingEditor',
      writer: 'writer',
    };

    createProject.mutate({
      name: form.name,
      type: form.type as 'novel' | 'webnovel' | 'screenplay',
      genre: genreLabel,
      genreTag: form.genre as any,
      roles: defaultRoles.map(r => ({
        name: r.name,
        role: r.role,
        systemPrompt: prompts[roleToPresetKey[r.role] || r.role as keyof typeof prompts] || '',
        isDefault: true,
      })),
    });
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8" data-guide-target="project-list">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">我的项目</h1>
          <div className="flex items-center gap-3">
            <NotificationBell />
            {tokenAccount && (
              <Link href="/ai-config/tokens"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition">
                <span>⚡</span>
                <span>{((tokenAccount.balance ?? 0) / 10_000_000).toFixed(2)} 元</span>
              </Link>
            )}
            <Link href="/dashboard/earnings"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition">
              创作收益
            </Link>
            <Link href="/recycle-bin"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition flex items-center gap-1.5">
              回收站
              {deletedProjects && deletedProjects.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
                  {deletedProjects.length}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* 新建项目 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold mb-4">新建项目</h2>

          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

          {/* 项目名称 + 项目类型 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">项目名称</label>
              <input type="text" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="给你的作品起个名字" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">项目类型</label>
              <select value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value, genre: '' }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900">
                {projectTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name} — {t.desc}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 题材选择 */}
          <div className="mb-6 space-y-4">
            {currentCategories.map(cat => (
              <div key={cat.name}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-700">{cat.name}</span>
                  <span className="text-xs text-gray-400">· 选择题材</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {cat.genres.map(g => (
                    <button key={g.code} type="button"
                      onClick={() => setForm(f => ({ ...f, genre: g.code }))}
                      className={`px-4 py-2 rounded text-sm border transition text-center ${
                        form.genre === g.code ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 hover:border-gray-400'
                      }`}>{g.label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 已选题材的提示词预览 */}
          {(() => {
            const selectedGenre = currentCategories.flatMap(c => c.genres).find(g => g.code === form.genre);
            if (!selectedGenre) return null;
            return (
              <div className="mb-4 p-4 bg-amber-50/60 border border-amber-100 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">已选：{selectedGenre.label}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />
                  <span className="text-xs text-amber-600">风格提示</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed mb-3">{selectedGenre.styleHint}</p>
                <div className="border-t border-amber-200 pt-2">
                  <p className="text-xs text-gray-400 mb-1">将被注入编辑/作者提示词：</p>
                  <p className="text-xs text-gray-600 bg-white rounded p-2 border border-amber-100">{selectedGenre.genrePrompt}</p>
                </div>
              </div>
            );
          })()}

          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              将自动载入 3 个 AI 角色（文学编辑、设定编辑、正文作者）
              {aiRolePresets[form.genre] && ' · 已载入专用提示词'}
            </p>
            <button onClick={handleCreate} disabled={createProject.isPending}
              className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
              {createProject.isPending ? '创建中...' : '+ 创建项目'}
            </button>
          </div>
        </div>

        {/* 项目列表 */}
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400">加载中...</p>
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid gap-4">
            {projects.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:border-gray-400 transition group relative"
              >
                <a href={`/project/${p.id}`} className="block">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold truncate max-w-[200px]">{p.name}</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        {p.genre || '点击完善信息'}{p.style ? ` · ${p.style}` : ''}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(p.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                </a>
                <button
                  onClick={(e) => handleDeleteProject(e, p)}
                  disabled={deleteProject.isPending}
                  className="absolute top-4 right-4 p-1.5 text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition rounded-lg hover:bg-red-50"
                  title="移入回收站">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400">还没有项目，使用上方的表单创建你的第一个作品吧</p>
          </div>
        )}
      </div>
    </main>
  );
}
