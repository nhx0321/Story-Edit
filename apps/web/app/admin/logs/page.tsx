'use client';

import { useState, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';

const actionLabels: Record<string, string> = {
  adjust_beans: '增减精灵豆',
  adjust_token: '增减Token',
  ban_user: '禁止操作',
  unban_user: '解除禁止',
  delete_user: '删除用户',
  promote_admin: '提升管理员',
  demote_admin: '降级管理员',
  set_user_role: '设置用户角色',
  set_admin_level: '设置管理员等级',
  create_preset: '创建预设',
  update_preset: '更新预设',
  publish_preset: '发布预设',
  unpublish_preset: '下架预设',
  delete_preset: '删除预设',
  create_genre_preset: '创建题材预设',
  update_genre_preset: '更新题材预设',
  delete_genre_preset: '删除题材预设',
};

export default function AdminLogsPage() {
  const [action, setAction] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [operatorSearch, setOperatorSearch] = useState('');
  const [showAdminDropdown, setShowAdminDropdown] = useState(false);
  const [page, setPage] = useState(1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = trpc.admin.getAuditLogs.useQuery({
    action: action || undefined,
    operatorId: operatorId || undefined,
    page,
    limit: 50,
  });

  // Fetch all admins with online status
  const { data: adminList, refetch: refetchAdmins } = trpc.admin.listAdmins.useQuery();

  // Refresh online status every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => refetchAdmins(), 10000);
    return () => clearInterval(interval);
  }, [refetchAdmins]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAdminDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Filter admins by search
  const filteredAdmins = adminList?.filter(a =>
    (a.nickname || '').toLowerCase().includes(operatorSearch.toLowerCase()) ||
    (a.displayId || '').toLowerCase().includes(operatorSearch.toLowerCase())
  );

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  const adminLevelLabels: Record<number, string> = {
    0: '总管理员',
    1: '一级管理员',
    2: '二级管理员',
    3: '三级管理员',
  };

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

        {/* 按操作人筛选 — 预设下拉栏 + 搜索 */}
        <div className="relative" ref={dropdownRef}>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowAdminDropdown(!showAdminDropdown)}
              className={`px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition flex items-center gap-2 ${operatorId ? 'bg-gray-50 border-gray-400' : ''}`}
            >
              {operatorId ? (
                <>
                  <span className="w-2 h-2 rounded-full" style={{
                    background: adminList?.find(a => a.id === operatorId)?.isOnline ? '#22c55e' : '#9ca3af'
                  }} />
                  <span>{adminList?.find(a => a.id === operatorId)?.nickname || '未知'}</span>
                  <span className="text-gray-400 text-xs">L{adminList?.find(a => a.id === operatorId)?.adminLevel ?? '?'}</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 12a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>选择操作人</span>
                </>
              )}
              <svg className={`w-3 h-3 text-gray-400 transition-transform ${showAdminDropdown ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {showAdminDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg w-64 max-h-64 overflow-y-auto z-20">
              {/* 搜索框 */}
              <div className="p-2 border-b border-gray-100">
                <input
                  type="text"
                  value={operatorSearch}
                  onChange={e => setOperatorSearch(e.target.value)}
                  placeholder="搜索昵称/UID..."
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                />
              </div>
              {/* 全部管理员按钮 */}
              <button
                onClick={() => {
                  setOperatorId('');
                  setOperatorSearch('');
                  setShowAdminDropdown(false);
                  setPage(1);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100"
              >
                <span className="text-gray-500">全部管理员</span>
              </button>
              {/* 管理员列表 */}
              {filteredAdmins?.map(a => (
                <button
                  key={a.id}
                  onClick={() => {
                    setOperatorId(a.id);
                    setOperatorSearch(a.nickname || '');
                    setShowAdminDropdown(false);
                    setPage(1);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{
                      background: a.isOnline ? '#22c55e' : '#9ca3af'
                    }} />
                    <span className="font-medium">{a.nickname}</span>
                    <span className="text-gray-400 text-xs">({a.displayId})</span>
                  </div>
                  <span className="text-gray-400 text-xs">{adminLevelLabels[a.adminLevel ?? 3] || ''}</span>
                </button>
              ))}
              {(!filteredAdmins || filteredAdmins.length === 0) && (
                <div className="px-3 py-4 text-sm text-gray-400 text-center">暂无管理员</div>
              )}
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
