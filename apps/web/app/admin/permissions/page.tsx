'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

const levelLabels: Record<number, string> = {
  1: '一级管理员（用户管理、付费管理、模板审核、预设管理）',
  2: '二级管理员（模板审核、预设管理只读）',
  3: '三级管理员（仅模板审核）',
};

export default function AdminPermissionsPage() {
  const utils = trpc.useUtils();
  const [searchId, setSearchId] = useState('');
  const [promoteLevel, setPromoteLevel] = useState(1);
  const [showPromote, setShowPromote] = useState(false);

  const { data: admins, isLoading } = trpc.admin.listAdmins.useQuery();
  const promote = trpc.admin.promoteToAdmin.useMutation({
    onSuccess: () => { utils.admin.listAdmins.invalidate(); setShowPromote(false); setSearchId(''); },
    onError: (e) => alert(e.message),
  });
  const demote = trpc.admin.demoteAdmin.useMutation({
    onSuccess: () => { utils.admin.listAdmins.invalidate(); },
    onError: (e) => alert(e.message),
  });

  const handlePromote = () => {
    if (!searchId) return;
    if (!confirm(`确定将用户 ${searchId} 设为${levelLabels[promoteLevel].split('（')[0]}吗？`)) return;
    promote.mutate({ userId: searchId, level: promoteLevel });
  };

  const handleDemote = (userId: string, nickname: string | null) => {
    if (!confirm(`确定移除 ${nickname || '该用户'} 的管理员权限吗？`)) return;
    demote.mutate({ userId });
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">权限管理</h1>
        <p className="text-sm text-gray-500 mt-1">管理管理员权限（仅总管理员可操作）</p>
      </div>

      {/* 添加管理员 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="font-semibold mb-4">添加管理员</h3>
        {!showPromote ? (
          <button onClick={() => setShowPromote(true)}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
            + 添加管理员
          </button>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">用户 ID（UUID）</label>
              <input type="text" value={searchId} onChange={e => setSearchId(e.target.value)}
                placeholder="输入用户 UUID..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">管理级别</label>
              <select value={promoteLevel} onChange={e => setPromoteLevel(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900">
                {Object.entries(levelLabels).map(([level, label]) => (
                  <option key={level} value={parseInt(level)}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handlePromote} disabled={promote.isPending || !searchId}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50">
                确认添加
              </button>
              <button onClick={() => setShowPromote(false)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition">取消</button>
            </div>
          </div>
        )}
      </div>

      {/* 管理员列表 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">昵称</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">UID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">管理级别</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">成为管理员时间</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">加载中...</td></tr>
            ) : !admins?.length ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">暂无管理员</td></tr>
            ) : (
              admins.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{a.nickname || '未设置'}</td>
                  <td className="px-4 py-3 text-gray-500">{a.displayId || '-'}</td>
                  <td className="px-4 py-3">
                    {a.adminLevel === 0 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">总管理员</span>
                    ) : a.adminLevel != null ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{a.adminLevel} 级</span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{new Date(a.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td className="px-4 py-3">
                    {a.adminLevel !== 0 && (
                      <button onClick={() => handleDemote(a.id, a.nickname)}
                        className="text-xs px-3 py-1 text-red-600 border border-red-200 rounded hover:bg-red-50 transition">
                        移除权限
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
