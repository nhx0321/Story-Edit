'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

export default function AdminDisclaimerPage() {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: '', content: '' });

  const { data: active, isLoading } = trpc.template.getActiveDisclaimer.useQuery();
  const { data: history } = trpc.template.getDisclaimerHistory.useQuery();

  const updateMutation = trpc.template.adminUpdateDisclaimer.useMutation({
    onSuccess: () => {
      utils.template.getActiveDisclaimer.invalidate();
      utils.template.getDisclaimerHistory.invalidate();
      setEditing(false);
      alert('免责声明已更新，新版本已生效');
    },
    onError: (e) => alert(e.message),
  });

  const handleSave = () => {
    if (!form.title.trim() || !form.content.trim()) {
      alert('标题和内容不能为空');
      return;
    }
    updateMutation.mutate(form);
  };

  const startEdit = () => {
    setEditing(true);
    setForm({
      title: active?.title || '',
      content: active?.content || '',
    });
  };

  if (isLoading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">免责声明管理</h1>
        <p className="text-sm text-gray-500 mt-1">管理用户发布模板时需确认的免责声明</p>
      </div>

      {/* 当前生效的免责声明 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">当前生效的免责声明</h2>
          {active && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
              版本 v{active.version}
            </span>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={12}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono leading-relaxed" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={updateMutation.isPending}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                保存并发布新版本
              </button>
              <button onClick={() => setEditing(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm">取消</button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="text-base font-medium mb-2">{active?.title}</h3>
            <pre className="whitespace-pre-wrap text-sm text-gray-600 bg-gray-50 rounded-lg p-4 border border-gray-100 leading-relaxed">
              {active?.content}
            </pre>
            <div className="mt-4">
              <button onClick={startEdit}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                编辑
              </button>
              <p className="text-xs text-gray-400 mt-2">保存后将创建新版本，旧版本自动失效</p>
            </div>
          </>
        )}
      </div>

      {/* 历史版本 */}
      {history && history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold mb-4">历史版本</h2>
          <div className="space-y-2">
            {history.map(h => (
              <details key={h.version} className="border border-gray-100 rounded-lg">
                <summary className="px-4 py-2 text-sm cursor-pointer hover:bg-gray-50 flex items-center justify-between">
                  <span>版本 v{h.version}</span>
                  <span className="text-xs text-gray-400">
                    {h.isActive ? '当前生效' : new Date(h.updatedAt).toLocaleString('zh-CN')}
                  </span>
                </summary>
                <pre className="whitespace-pre-wrap text-xs text-gray-600 bg-gray-50 p-4 border-t border-gray-100 leading-relaxed">
                  {h.content}
                </pre>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
