'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

const CATEGORY_LABELS: Record<string, string> = {
  methodology: '方法论',
  structure: '剧本结构',
  style: '正文风格',
  setting: '设定',
  ai_prompt: 'AI角色提示词',
};

export default function AdminTemplatesPage() {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: '', content: '', price: 0 });

  const { data: templates, isLoading } = trpc.template.adminListOfficial.useQuery();

  const createMutation = trpc.template.adminCreateOfficial.useMutation({
    onSuccess: () => { utils.template.adminListOfficial.invalidate(); setShowCreate(false); setForm({ title: '', description: '', category: '', content: '', price: 0 }); },
  });
  const updateMutation = trpc.template.adminUpdateOfficial.useMutation({
    onSuccess: () => { utils.template.adminListOfficial.invalidate(); setEditing(null); },
  });
  const deleteMutation = trpc.template.adminDeleteOfficial.useMutation({
    onSuccess: () => { utils.template.adminListOfficial.invalidate(); },
  });
  const toggleMutation = trpc.template.adminTogglePublish.useMutation({
    onSuccess: () => { utils.template.adminListOfficial.invalidate(); },
  });

  const handleCreate = () => {
    if (!form.title || !form.content) return;
    createMutation.mutate({ ...form, category: form.category || undefined });
  };

  const handleUpdate = (id: string) => {
    updateMutation.mutate({ id, ...form });
  };

  const handleDelete = (id: string, title: string) => {
    if (!confirm(`确定要删除官方模板「${title}」吗？`)) return;
    deleteMutation.mutate({ id });
  };

  const handleToggle = (id: string) => {
    toggleMutation.mutate({ id });
  };

  const startEdit = (t: { id: string; title: string; description?: string | null; category?: string | null; content: string; price: number | null; isPublished: boolean | null }) => {
    setEditing(t.id);
    setForm({
      title: t.title,
      description: t.description || '',
      category: t.category || '',
      content: t.content,
      price: t.price ?? 0,
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm({ title: '', description: '', category: '', content: '', price: 0 });
  };

  if (isLoading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">官方模板管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理和发布官方模板</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
          {showCreate ? '取消' : '+ 新建模板'}
        </button>
      </div>

      {/* 创建表单 */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold mb-4">新建官方模板</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">标题 *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="模板标题" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">简介</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="模板简介" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">未分类</option>
                  <option value="methodology">方法论</option>
                  <option value="structure">剧本结构</option>
                  <option value="style">正文风格</option>
                  <option value="setting">设定</option>
                  <option value="ai_prompt">AI角色提示词</option>
                </select>
              </div>
              <div className="w-32">
                <label className="block text-sm font-medium text-gray-700 mb-1">价格（分）</label>
                <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">内容 *</label>
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" placeholder="模板内容..." />
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={createMutation.isPending}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                创建并发布
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 模板列表 */}
      <div className="space-y-4">
        {templates?.map(t => (
          <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5">
            {editing === t.id ? (
              <>
                {/* 编辑模式 */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                    <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">简介</label>
                    <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
                      <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="">未分类</option>
                        <option value="methodology">方法论</option>
                        <option value="structure">剧本结构</option>
                        <option value="style">正文风格</option>
                        <option value="setting">设定</option>
                        <option value="ai_prompt">AI角色提示词</option>
                      </select>
                    </div>
                    <div className="w-32">
                      <label className="block text-sm font-medium text-gray-700 mb-1">价格（分）</label>
                      <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
                    <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                      rows={8}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(t.id)} disabled={updateMutation.isPending}
                      className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                      保存
                    </button>
                    <button onClick={cancelEdit}
                      className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm">取消</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* 查看模式 */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">{t.title}</h3>
                      {t.category && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {CATEGORY_LABELS[t.category] || t.category}
                        </span>
                      )}
                      {t.isPublished ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">已发布</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">未发布</span>
                      )}
                      {(t.price ?? 0) === 0 ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">免费</span>
                      ) : (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">¥{((t.price ?? 0) / 100).toFixed(2)}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{t.description || '无简介'}</p>
                    <p className="text-xs text-gray-400 mt-1">浏览 {t.viewCount || 0} · 导入 {t.importCount || 0}</p>
                    <details className="mt-2">
                      <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">查看内容</summary>
                      <pre className="whitespace-pre-wrap text-xs text-gray-600 bg-gray-50 rounded-lg p-3 mt-2 max-h-40 overflow-y-auto border border-gray-100">
                        {t.content?.slice(0, 500)}{t.content && t.content.length > 500 ? '...' : ''}
                      </pre>
                    </details>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
                  <button onClick={() => startEdit(t)}
                    className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                    编辑
                  </button>
                  <button onClick={() => handleToggle(t.id)}
                    className={`px-4 py-1.5 text-sm rounded-lg transition ${
                      t.isPublished
                        ? 'border border-amber-300 text-amber-600 hover:bg-amber-50'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}>
                    {t.isPublished ? '下架' : '发布'}
                  </button>
                  <button onClick={() => handleDelete(t.id, t.title)}
                    className="px-4 py-1.5 text-sm text-red-500 hover:text-red-700 transition">
                    删除
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {templates?.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500">暂无官方模板</p>
            <button onClick={() => setShowCreate(true)}
              className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
              创建第一个官方模板
            </button>
          </div>
        )}
      </div>
    </>
  );
}
