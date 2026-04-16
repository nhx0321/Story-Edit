'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

const actionLabels: Record<string, string> = {
  adjust_subscription: '调整账户',
  adjust_beans: '增减精灵豆',
  ban_user: '禁止操作',
  unban_user: '解除禁止',
  delete_user: '删除用户',
  promote_admin: '提升管理员',
  demote_admin: '降级管理员',
  create_preset: '创建预设',
  update_preset: '更新预设',
  publish_preset: '发布预设',
  unpublish_preset: '下架预设',
  delete_preset: '删除预设',
};

export default function AdminLogsPage() {
  const [action, setAction] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [operatorSearch, setOperatorSearch] = useState('');
  const [page, setPage] = useState(1);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.getAuditLogs.useQuery({
    action: action || undefined,
    operatorId: operatorId || undefined,
    page,
    limit: 50,
  });

  // Search for operators by nickname/UID
  const { data: adminList } = trpc.admin.listAdmins.useQuery();
  const filteredAdmins = adminList?.filter(a =>
    (a.nickname || '').toLowerCase().includes(operatorSearch.toLowerCase()) ||
    (a.displayId || '').toLowerCase().includes(operatorSearch.toLowerCase())
  );

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">操作日志</h1>
        <p className="text-sm text-gray-500 mt-1">追踪管理员操作记录</p>
      </div>

      {/* 筛选 */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <select value={action} onChange={e => { setAction(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
          <option value="">全部操作类型</option>
          {Object.entries(actionLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        {action && (
          <button onClick={() => { setAction(''); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition">
            重置操作
          </button>
        )}

        {/* 按操作人筛选 */}
        <div className="relative">
          <input
            type="text"
            value={operatorSearch}
            onChange={e => { setOperatorSearch(e.target.value); setOperatorId(''); setPage(1); }}
            placeholder="搜索操作人..."
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          {operatorSearch && filteredAdmins && filteredAdmins.length > 0 && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg w-48 max-h-48 overflow-y-auto z-10">
              {filteredAdmins.map(a => (
                <button
                  key={a.id}
                  onClick={() => {
                    setOperatorId(a.id);
                    setOperatorSearch(a.nickname || '');
                    setPage(1);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                >
                  {a.nickname} <span className="text-gray-400 text-xs">({a.displayId})</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {operatorId && (
          <button onClick={() => { setOperatorId(''); setOperatorSearch(''); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition">
            重置操作人
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">加载中...</div>
      ) : !data?.logs?.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">暂无操作日志</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">时间</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">操作人</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">操作类型</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">目标</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">详情</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.logs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-medium">{log.adminNickname}</span>
                        {log.adminDisplayId && (
                          <span className="text-xs text-gray-400 ml-1">{log.adminDisplayId}</span>
                        )}
                        <span className="text-xs text-gray-400 ml-1">L{log.adminLevel ?? '?'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                        {actionLabels[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {log.targetType ? `${log.targetType}${log.targetId ? ` (${log.targetId.slice(0, 8)}...)` : ''}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 max-w-xs truncate">
                      {log.details ? JSON.stringify(log.details) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50 transition">上一页</button>
              <span className="text-sm text-gray-500">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50 transition">下一页</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
