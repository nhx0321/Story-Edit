'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

export default function AIConfigApiKeysPage() {
  const utils = trpc.useUtils();
  const { data: keys, isLoading } = trpc.token.listApiKeys.useQuery();
  const createMutation = trpc.token.createApiKey.useMutation({
    onSuccess: () => utils.token.listApiKeys.invalidate(),
  });
  const revokeMutation = trpc.token.revokeApiKey.useMutation({
    onSuccess: () => utils.token.listApiKeys.invalidate(),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyLimit, setNewKeyLimit] = useState(60);
  const [createdKey, setCreatedKey] = useState('');

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    try {
      const result = await createMutation.mutateAsync({
        name: newKeyName,
        rateLimitPerMin: newKeyLimit,
      });
      setCreatedKey(result.key);
      setNewKeyName('');
    } catch (e: any) {
      alert(e.message || '创建失败');
    }
  };

  if (isLoading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">API Keys 管理</h1>

      {/* 创建新 Key */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold mb-3">创建 API Key</h2>
        <p className="text-sm text-gray-500 mb-4">API Key 用于在站外通过 OpenAI 兼容接口调用平台 AI 服务</p>

        {!showCreate ? (
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition">
            + 创建新 Key
          </button>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Key 名称</label>
              <input
                type="text"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                placeholder="如：我的Python脚本"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">速率限制（次/分钟）</label>
              <input
                type="number"
                value={newKeyLimit}
                onChange={e => setNewKeyLimit(parseInt(e.target.value) || 60)}
                className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={createMutation.isPending}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition">
                {createMutation.isPending ? '创建中...' : '确认创建'}
              </button>
              <button onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                取消
              </button>
            </div>
          </div>
        )}

        {/* 显示刚创建的 Key */}
        {createdKey && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm font-medium text-amber-800 mb-2">请复制保存此 Key，关闭后无法再次查看：</p>
            <code className="block bg-white px-3 py-2 rounded border border-amber-300 text-sm font-mono break-all select-all">
              {createdKey}
            </code>
            <button onClick={() => { navigator.clipboard?.writeText(createdKey); }}
              className="mt-2 px-3 py-1 text-xs border border-amber-300 rounded hover:bg-amber-100 transition">
              复制到剪贴板
            </button>
          </div>
        )}
      </div>

      {/* Key 列表 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">名称</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Key 前缀</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">状态</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">速率限制</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">最后使用</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">创建时间</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {(keys ?? []).map((key: any) => (
              <tr key={key.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{key.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{key.keyPrefix}...</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    key.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {key.status === 'active' ? '活跃' : '已撤销'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{key.rateLimitPerMin}/分钟</td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString('zh-CN') : '从未使用'}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(key.createdAt).toLocaleDateString('zh-CN')}
                </td>
                <td className="px-4 py-3 text-center">
                  {key.status === 'active' && (
                    <button
                      onClick={() => { if (confirm('确定撤销此 Key？撤销后立即失效。')) revokeMutation.mutate({ keyId: key.id }); }}
                      className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition"
                    >
                      撤销
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(!keys || keys.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  暂无 API Key，创建你的第一个 Key
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 接入说明 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
        <h2 className="font-semibold mb-3">站外接入说明</h2>
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium text-gray-700">端点</p>
            <code className="block bg-gray-50 px-3 py-2 rounded mt-1 text-xs font-mono">
              POST https://你的域名/api/v1/chat/completions
            </code>
          </div>
          <div>
            <p className="font-medium text-gray-700">认证</p>
            <code className="block bg-gray-50 px-3 py-2 rounded mt-1 text-xs font-mono">
              Authorization: Bearer sk-你的API-Key
            </code>
          </div>
          <div>
            <p className="font-medium text-gray-700">curl 示例</p>
            <pre className="bg-gray-50 px-3 py-2 rounded mt-1 text-xs font-mono overflow-x-auto">{`curl -X POST https://你的域名/api/v1/chat/completions \\
  -H "Authorization: Bearer sk-YOUR-KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "deepseek-chat", "messages": [{"role": "user", "content": "你好"}]}'`}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
