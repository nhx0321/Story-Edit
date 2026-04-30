'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

const statusLabels: Record<string, string> = {
  active: '活跃',
  disabled: '已禁用',
  rate_limited: '已达日限额',
};
const statusColors: Record<string, string> = {
  active: 'text-green-600 bg-green-50',
  disabled: 'text-gray-500 bg-gray-100',
  rate_limited: 'text-red-600 bg-red-50',
};

export default function AdminChannelsPage() {
  const utils = trpc.useUtils();
  const { data: channels, isLoading } = trpc.token.listChannels.useQuery();
  const addMutation = trpc.token.addChannel.useMutation({
    onSuccess: () => { utils.token.listChannels.invalidate(); setShowAdd(false); resetForm(); },
  });
  const updateMutation = trpc.token.updateChannel.useMutation({
    onSuccess: () => { utils.token.listChannels.invalidate(); setEditingId(null); },
  });
  const deleteMutation = trpc.token.deleteChannel.useMutation({
    onSuccess: () => utils.token.listChannels.invalidate(),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    baseUrl: '',
    apiKeyPlain: '',
  });
  const [form, setForm] = useState({
    provider: 'deepseek',
    name: '',
    apiKeyPlain: '',
    baseUrl: '',
    priority: 0,
    weight: 1,
    userTier: 'all',
    dailyLimit: 5000000,
  });

  function resetForm() {
    setForm({ provider: 'deepseek', name: '', apiKeyPlain: '', baseUrl: '', priority: 0, weight: 1, userTier: 'all', dailyLimit: 5000000 });
  }

  const startEdit = (ch: any) => {
    setEditingId(ch.id);
    setEditForm({
      name: ch.name || '',
      baseUrl: ch.baseUrl || '',
      apiKeyPlain: '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      const payload: any = { id: editingId, name: editForm.name, baseUrl: editForm.baseUrl };
      if (editForm.apiKeyPlain) payload.apiKeyPlain = editForm.apiKeyPlain;
      await updateMutation.mutateAsync(payload);
    } catch (e: any) {
      alert(e.message || '保存失败');
    }
  };

  if (isLoading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">渠道管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理上游API渠道、配置负载均衡和日消耗限制</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition"
        >
          + 添加渠道
        </button>
      </div>

      {/* 渠道列表 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">名称</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">供应商</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Base URL</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">状态</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">用户等级</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">今日消耗</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">日限额</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">最近错误</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {(channels ?? []).map((ch: any) => {
              const usagePercent = ch.dailyLimit > 0 ? Math.round((ch.dailyUsed / ch.dailyLimit) * 100) : 0;

              if (editingId === ch.id) {
                return (
                  <tr key={ch.id} className="border-b border-gray-100 bg-blue-50/30">
                    <td className="px-4 py-2">
                      <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        placeholder="渠道名称"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                    </td>
                    <td className="px-4 py-2 text-gray-500">{ch.provider}</td>
                    <td className="px-4 py-2">
                      <input type="text" value={editForm.baseUrl} onChange={e => setEditForm({ ...editForm, baseUrl: e.target.value })}
                        placeholder="https://api.example.com/v1"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono text-xs" />
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[ch.status] || ''}`}>
                        {statusLabels[ch.status] || ch.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-xs">{ch.userTier}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">{ch.dailyUsed?.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{ch.dailyLimit?.toLocaleString()}</td>
                    <td className="px-4 py-2">
                      <input type="password" value={editForm.apiKeyPlain} onChange={e => setEditForm({ ...editForm, apiKeyPlain: e.target.value })}
                        placeholder="留空不修改 API Key"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex justify-center gap-1">
                        <button onClick={handleSaveEdit} disabled={updateMutation.isPending}
                          className="px-2 py-1 text-xs text-white bg-gray-900 rounded hover:bg-gray-800 disabled:opacity-50">
                          {updateMutation.isPending ? '...' : '保存'}
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded">
                          取消
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={ch.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/channels/${ch.id}`} className="text-blue-600 hover:underline">
                      {ch.name || ch.provider}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{ch.provider}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 max-w-[200px] truncate" title={ch.baseUrl || ''}>
                    {ch.baseUrl || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[ch.status] || ''}`}>
                      {statusLabels[ch.status] || ch.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-xs">{ch.userTier}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={usagePercent >= 80 ? 'text-red-600 font-medium' : 'text-gray-700'}>
                      {ch.dailyUsed?.toLocaleString()}
                    </span>
                    <span className="text-gray-400 ml-1">({usagePercent}%)</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{ch.dailyLimit?.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {ch.lastErrorMessage ? (
                      <span className="text-red-500 text-xs truncate max-w-[120px] inline-block" title={ch.lastErrorMessage}>
                        {ch.lastErrorMessage}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => startEdit(ch)}
                        className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition">
                        编辑
                      </button>
                      {ch.status === 'active' ? (
                        <button
                          onClick={() => updateMutation.mutate({ id: ch.id, status: 'disabled' })}
                          className="px-2 py-1 text-xs text-amber-600 hover:bg-amber-50 rounded transition"
                        >
                          禁用
                        </button>
                      ) : (
                        <button
                          onClick={() => updateMutation.mutate({ id: ch.id, status: 'active' })}
                          className="px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded transition"
                        >
                          启用
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm('确定删除此渠道？')) deleteMutation.mutate({ id: ch.id });
                        }}
                        className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {(!channels || channels.length === 0) && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                  暂无渠道，点击&quot;添加渠道&quot;开始配置
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 添加渠道对话框 */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-lg">
            <h2 className="text-lg font-bold mb-4">添加上游渠道</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">供应商</label>
                  <select
                    value={form.provider}
                    onChange={e => setForm({ ...form, provider: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="deepseek">DeepSeek</option>
                    <option value="longcat">LongCat</option>
                    <option value="qwen">Qwen</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">名称</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="如：LongCat免费池1号"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">API Key</label>
                <input
                  type="password"
                  value={form.apiKeyPlain}
                  onChange={e => setForm({ ...form, apiKeyPlain: e.target.value })}
                  placeholder="输入明文 API Key"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Base URL</label>
                <input
                  type="text"
                  value={form.baseUrl}
                  onChange={e => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder="如: https://api.deepseek.com/v1"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">优先级</label>
                  <input type="number" value={form.priority} onChange={e => setForm({ ...form, priority: +e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">权重</label>
                  <input type="number" value={form.weight} onChange={e => setForm({ ...form, weight: +e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">服务用户</label>
                  <select value={form.userTier} onChange={e => setForm({ ...form, userTier: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="all">所有用户</option>
                    <option value="free">仅免费用户</option>
                    <option value="vip">仅付费用户</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">日消耗上限（token）</label>
                <input type="number" value={form.dailyLimit} onChange={e => setForm({ ...form, dailyLimit: +e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => { setShowAdd(false); resetForm(); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
              <button
                onClick={() => addMutation.mutate(form)}
                disabled={!form.apiKeyPlain || addMutation.isPending}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition"
              >
                {addMutation.isPending ? '添加中...' : '确认添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
