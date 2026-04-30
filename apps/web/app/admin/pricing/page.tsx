'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

export default function PricingPage() {
  const utils = trpc.useUtils();
  const { data: pricingList, isLoading } = trpc.token.listPricing.useQuery();
  const addMutation = trpc.token.addPricing.useMutation({
    onSuccess: () => utils.token.listPricing.invalidate(),
  });
  const updateMutation = trpc.token.updatePricing.useMutation({
    onSuccess: () => { utils.token.listPricing.invalidate(); setEditingId(null); },
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    provider: '',
    modelId: '',
    modelName: '',
    groupName: 'default',
    inputPricePer1m: 0,
    outputPricePer1m: 0,
    sortOrder: 0,
  });
  const [form, setForm] = useState({
    provider: 'deepseek',
    modelId: '',
    modelName: '',
    groupName: 'default' as string,
    inputPricePer1m: 100,
    outputPricePer1m: 200,
    sortOrder: 0,
  });

  const toYuanPer1m = (cents: number) => (cents / 100).toFixed(2);

  const handleAdd = async () => {
    if (!form.modelId || !form.modelName) return;
    try {
      await addMutation.mutateAsync(form);
      setShowAdd(false);
      setForm({ provider: 'deepseek', modelId: '', modelName: '', groupName: 'default', inputPricePer1m: 100, outputPricePer1m: 200, sortOrder: 0 });
    } catch (e: any) {
      alert(e.message || '添加失败');
    }
  };

  const startEdit = (p: any) => {
    setEditingId(p.id);
    setEditForm({
      provider: p.provider,
      modelId: p.modelId,
      modelName: p.modelName,
      groupName: p.groupName || 'default',
      inputPricePer1m: p.inputPricePer1m,
      outputPricePer1m: p.outputPricePer1m,
      sortOrder: p.sortOrder ?? 0,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      await updateMutation.mutateAsync({ id: editingId, ...editForm });
    } catch (e: any) {
      alert(e.message || '保存失败');
    }
  };

  if (isLoading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">模型定价管理</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">定价列表</h2>
          <button onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition">
            {showAdd ? '取消' : '+ 添加定价'}
          </button>
        </div>

        {showAdd && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">厂商</label>
                <select value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm">
                  <option value="deepseek">DeepSeek</option>
                  <option value="longcat">LongCat</option>
                  <option value="qwen">Qwen</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">模型ID</label>
                <input type="text" value={form.modelId} onChange={e => setForm({ ...form, modelId: e.target.value })}
                  placeholder="如 deepseek-chat"
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">展示名称</label>
                <input type="text" value={form.modelName} onChange={e => setForm({ ...form, modelName: e.target.value })}
                  placeholder="如 DeepSeek-V3"
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">模型分组（访问等级）</label>
                <select value={form.groupName} onChange={e => setForm({ ...form, groupName: e.target.value })}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm">
                  <option value="default">默认 — 所有用户可用</option>
                  <option value="premium">付费 — 仅付费用户和管理员</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">输入价格 (分/百万token)</label>
                <input type="number" value={form.inputPricePer1m} onChange={e => setForm({ ...form, inputPricePer1m: parseInt(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm" />
                <p className="text-xs text-gray-400 mt-0.5">= ¥{toYuanPer1m(form.inputPricePer1m)}/百万token</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">输出价格 (分/百万token)</label>
                <input type="number" value={form.outputPricePer1m} onChange={e => setForm({ ...form, outputPricePer1m: parseInt(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm" />
                <p className="text-xs text-gray-400 mt-0.5">= ¥{toYuanPer1m(form.outputPricePer1m)}/百万token</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">排序</label>
                <input type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
                  className="w-20 px-2 py-1.5 border border-gray-200 rounded text-sm" />
              </div>
            </div>
            <button onClick={handleAdd} disabled={addMutation.isPending}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition">
              {addMutation.isPending ? '添加中...' : '确认添加'}
            </button>
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">厂商</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">模型ID</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">展示名称</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">分组</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">输入价格</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">输出价格</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">排序</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">状态</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {(pricingList ?? []).map((p: any) => (
              editingId === p.id ? (
                <tr key={p.id} className="border-b border-gray-100 bg-blue-50/30">
                  <td className="px-4 py-2">
                    <select value={editForm.provider} onChange={e => setEditForm({ ...editForm, provider: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                      <option value="deepseek">DeepSeek</option>
                      <option value="longcat">LongCat</option>
                      <option value="qwen">Qwen</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input type="text" value={editForm.modelId} onChange={e => setEditForm({ ...editForm, modelId: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="text" value={editForm.modelName} onChange={e => setEditForm({ ...editForm, modelName: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                  </td>
                  <td className="px-4 py-2">
                    <select value={editForm.groupName} onChange={e => setEditForm({ ...editForm, groupName: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                      <option value="default">默认</option>
                      <option value="premium">付费</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" value={editForm.inputPricePer1m} onChange={e => setEditForm({ ...editForm, inputPricePer1m: parseInt(e.target.value) || 0 })}
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" value={editForm.outputPricePer1m} onChange={e => setEditForm({ ...editForm, outputPricePer1m: parseInt(e.target.value) || 0 })}
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right" />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input type="number" value={editForm.sortOrder} onChange={e => setEditForm({ ...editForm, sortOrder: parseInt(e.target.value) || 0 })}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center" />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {p.isActive ? '活跃' : '已禁用'}
                    </span>
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
              ) : (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{p.provider}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.modelId}</td>
                  <td className="px-4 py-3">{p.modelName}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.groupName === 'premium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {p.groupName === 'premium' ? '付费' : '默认'}
                    </span>
                    <span className="text-xs text-gray-400 ml-1">
                      {p.groupName === 'premium' ? '付费用户/管理员' : '所有用户'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">¥{toYuanPer1m(p.inputPricePer1m)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">¥{toYuanPer1m(p.outputPricePer1m)}</td>
                  <td className="px-4 py-3 text-center text-gray-400">{p.sortOrder}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => updateMutation.mutate({ id: p.id, isActive: !p.isActive })}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                      {p.isActive ? '活跃' : '已禁用'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => startEdit(p)}
                      className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition">
                      编辑
                    </button>
                  </td>
                </tr>
              )
            ))}
            {(!pricingList || pricingList.length === 0) && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                  暂无定价数据，请添加模型定价
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
