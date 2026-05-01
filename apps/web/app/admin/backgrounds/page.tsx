'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

export default function AdminBackgroundsPage() {
  const utils = trpc.useUtils();
  const { data: backgrounds, isLoading } = trpc.admin.listVideoBackgrounds.useQuery();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', fileName: '', description: '', hasAudio: true, sortOrder: 0 });

  const createMutation = trpc.admin.createVideoBackground.useMutation({
    onSuccess: () => { utils.admin.listVideoBackgrounds.invalidate(); resetForm(); },
  });
  const updateMutation = trpc.admin.updateVideoBackground.useMutation({
    onSuccess: () => { utils.admin.listVideoBackgrounds.invalidate(); resetForm(); },
  });
  const deleteMutation = trpc.admin.deleteVideoBackground.useMutation({
    onSuccess: () => { utils.admin.listVideoBackgrounds.invalidate(); },
  });

  function resetForm() {
    setForm({ name: '', fileName: '', description: '', hasAudio: true, sortOrder: 0 });
    setShowForm(false);
    setEditId(null);
  }

  function handleEdit(bg: NonNullable<typeof backgrounds>[number]) {
    setEditId(bg.id);
    setForm({
      name: bg.name,
      fileName: bg.fileName,
      description: bg.description || '',
      hasAudio: bg.hasAudio ?? true,
      sortOrder: bg.sortOrder ?? 0,
    });
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editId) {
      updateMutation.mutate({
        id: editId,
        name: form.name,
        description: form.description || null,
        hasAudio: form.hasAudio,
        sortOrder: form.sortOrder,
      });
    } else {
      createMutation.mutate({
        name: form.name,
        fileName: form.fileName,
        description: form.description || undefined,
        hasAudio: form.hasAudio,
        sortOrder: form.sortOrder,
      });
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">背景管理</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition"
        >
          注册新背景
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm text-amber-800">
        视频文件需手动上传到 <code className="bg-amber-100 px-1 rounded">public/backgrounds/</code> 目录，
        缩略图同名 <code className="bg-amber-100 px-1 rounded">.jpg</code> 格式（如 forest-rain.mp4 对应 forest-rain.jpg）。
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4 mb-6 space-y-3">
          <h3 className="font-medium text-gray-900">{editId ? '编辑背景' : '注册新背景'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">名称</label>
              <input type="text" required value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                placeholder="如：森林雨景" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">文件名</label>
              <input type="text" required value={form.fileName} disabled={!!editId}
                onChange={e => setForm({ ...form, fileName: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                placeholder="如：forest-rain.mp4" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">描述</label>
            <input type="text" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              placeholder="可选" />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.hasAudio}
                onChange={e => setForm({ ...form, hasAudio: e.target.checked })}
                className="rounded" />
              包含音频
            </label>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">排序</label>
              <input type="number" value={form.sortOrder}
                onChange={e => setForm({ ...form, sortOrder: Number(e.target.value) })}
                className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition disabled:opacity-50">
              {editId ? '保存' : '注册'}
            </button>
            <button type="button" onClick={resetForm}
              className="px-4 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 transition">
              取消
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="text-gray-400 text-center py-12">加载中...</div>
      ) : !backgrounds || backgrounds.length === 0 ? (
        <div className="text-gray-400 text-center py-12">暂无背景，点击「注册新背景」添加</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">名称</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">文件名</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">音频</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">状态</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">排序</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {backgrounds.map(bg => (
                <tr key={bg.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{bg.name}</td>
                  <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{bg.fileName}</td>
                  <td className="px-4 py-2.5 text-center">{bg.hasAudio ? '有' : '无'}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                      bg.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {bg.isActive ? '启用' : '已禁用'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-500">{bg.sortOrder}</td>
                  <td className="px-4 py-2.5 text-right space-x-2">
                    <button onClick={() => handleEdit(bg)}
                      className="text-blue-600 hover:text-blue-800 text-xs">编辑</button>
                    <button onClick={() => { if (confirm('确定禁用此背景？')) deleteMutation.mutate({ id: bg.id }); }}
                      className="text-red-600 hover:text-red-800 text-xs">禁用</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
