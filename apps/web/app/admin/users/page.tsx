'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

const MODEL_GROUP_OPTIONS = [
  { value: 'default', label: '默认模型' },
  { value: 'premium', label: '付费模型' },
];

function UserGroupPanel() {
  const utils = trpc.useUtils();
  const { data: groups, isLoading } = trpc.token.listUserGroups.useQuery();
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editLimit, setEditLimit] = useState(0);
  const [editModels, setEditModels] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(true);

  const updateMutation = trpc.token.updateUserGroup.useMutation({
    onSuccess: () => { utils.token.listUserGroups.invalidate(); setEditingGroup(null); },
    onError: (e) => alert(e.message),
  });

  const startEdit = (g: { name: string; dailyTokenLimit: number | null; allowedModelGroups: unknown }) => {
    setEditingGroup(g.name);
    setEditLimit(Number(g.dailyTokenLimit ?? 0));
    setEditModels((g.allowedModelGroups as string[]) ?? ['default']);
  };

  const saveEdit = (name: string) => {
    updateMutation.mutate({ name, dailyTokenLimit: editLimit, allowedModelGroups: editModels });
  };

  const toggleModel = (value: string) => {
    setEditModels(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };

  return (
    <div className="mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">
        <span className="font-medium text-sm">用户组配置</span>
        <span className="text-gray-400 text-xs">{collapsed ? '展开' : '收起'}</span>
      </button>
      {!collapsed && (
        <div className="border-t border-gray-100 px-4 py-3">
          {isLoading ? (
            <div className="text-center py-4 text-gray-400 text-sm">加载中...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 pr-4 font-medium">组名</th>
                  <th className="py-2 pr-4 font-medium">显示名</th>
                  <th className="py-2 pr-4 font-medium">每日限额 (token)</th>
                  <th className="py-2 pr-4 font-medium">可用模型分组</th>
                  <th className="py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {groups?.map(g => (
                  <tr key={g.name}>
                    <td className="py-2 pr-4 font-mono text-xs">{g.name}</td>
                    <td className="py-2 pr-4">{g.displayName}</td>
                    <td className="py-2 pr-4">
                      {editingGroup === g.name ? (
                        <input type="number" value={editLimit} onChange={e => setEditLimit(parseInt(e.target.value) || 0)}
                          className="w-28 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gray-900" />
                      ) : (
                        <span>{Number(g.dailyTokenLimit) === 0 ? '无限' : Number(g.dailyTokenLimit).toLocaleString()}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {editingGroup === g.name ? (
                        <div className="flex gap-2">
                          {MODEL_GROUP_OPTIONS.map(opt => (
                            <label key={opt.value} className="flex items-center gap-1 text-xs cursor-pointer">
                              <input type="checkbox" checked={editModels.includes(opt.value)}
                                onChange={() => toggleModel(opt.value)} className="rounded" />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="flex gap-1 flex-wrap">
                          {((g.allowedModelGroups as string[]) ?? []).map(mg => (
                            <span key={mg} className={`text-xs px-1.5 py-0.5 rounded ${mg === 'premium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                              {mg === 'default' ? '默认' : mg === 'premium' ? '付费' : mg}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2">
                      {editingGroup === g.name ? (
                        <div className="flex gap-1">
                          <button onClick={() => saveEdit(g.name)} disabled={updateMutation.isPending}
                            className="text-xs px-2 py-1 bg-gray-900 text-white rounded hover:bg-gray-800 transition disabled:opacity-50">保存</button>
                          <button onClick={() => setEditingGroup(null)}
                            className="text-xs px-2 py-1 border rounded hover:bg-gray-50 transition">取消</button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(g as any)}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition">编辑</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-gray-400 mt-2">每日限额为 0 表示不限额。修改后约 5 分钟内生效（缓存刷新）。</p>
        </div>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedUserNickname, setSelectedUserNickname] = useState<string>('');
  const [selectedUserBeanBalance, setSelectedUserBeanBalance] = useState<number>(0);
  const [selectedUserTokenBalance, setSelectedUserTokenBalance] = useState<number>(0);
  const [selectedUserTokenConsumed, setSelectedUserTokenConsumed] = useState<number>(0);
  const [actionType, setActionType] = useState<string | null>(null);
  const [adjustBeans, setAdjustBeans] = useState(0);
  const [adjustToken, setAdjustToken] = useState(0);
  const [banType, setBanType] = useState<'publish' | 'payment' | 'all'>('all');
  const [selectedRole, setSelectedRole] = useState<string>('free');
  const [selectedAdminLevel, setSelectedAdminLevel] = useState<number | null>(null);
  const [selectedIsAdmin, setSelectedIsAdmin] = useState(false);

  const { data, isLoading } = trpc.admin.listUsers.useQuery({ search: search || undefined, page, limit: 20 });
  // 获取用户详情
  const { data: userDetail } = trpc.admin.getUserDetail.useQuery({ userId: selectedUser || '' }, {
    enabled: !!selectedUser,
  });
  const adjustBeansMutation = trpc.admin.adjustBeans.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setSelectedUser(null); setActionType(null); setAdjustBeans(0); },
    onError: (e) => alert(e.message),
  });
  const adjustTokenMutation = trpc.admin.adjustTokenBalance.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setSelectedUser(null); setActionType(null); setAdjustToken(0); },
    onError: (e) => alert(e.message),
  });
  const banUser = trpc.admin.banUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setSelectedUser(null); setActionType(null); },
    onError: (e) => alert(e.message),
  });
  const unbanUser = trpc.admin.unbanUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setSelectedUser(null); setActionType(null); },
    onError: (e) => alert(e.message),
  });
  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setSelectedUser(null); setActionType(null); },
    onError: (e) => alert(e.message),
  });
  const setUserRoleMutation = trpc.admin.setUserRole.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setSelectedUser(null); setActionType(null); },
    onError: (e) => alert(e.message),
  });
  const setAdminLevelMutation = trpc.admin.setAdminLevel.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setSelectedUser(null); setActionType(null); },
    onError: (e) => alert(e.message),
  });

  // 当选中用户变化时，获取详情
  const handleSelectUser = (u: any) => {
    setSelectedUser(u.id);
    setSelectedUserNickname(u.nickname || '用户');
    setActionType(null);
    setSelectedRole(u.userRole || 'free');
    setSelectedIsAdmin(u.isAdmin || false);
    setSelectedAdminLevel(u.adminLevel ?? null);
    // 获取详情（Token余额、精灵豆余额）
    utils.client.admin.getUserDetail.query({ userId: u.id }).then(detail => {
      setSelectedUserBeanBalance(detail.beanBalance ?? 0);
      setSelectedUserTokenBalance((detail as any).tokenBalance ?? 0);
      setSelectedUserTokenConsumed((detail as any).tokenConsumed ?? 0);
    }).catch(() => {
      setSelectedUserBeanBalance(0);
      setSelectedUserTokenBalance(0);
      setSelectedUserTokenConsumed(0);
    });
  };

  const handleAction = () => {
    if (!selectedUser) return;
    if (actionType === 'adjustBeans') {
      if (adjustBeans === 0) return;
      adjustBeansMutation.mutate({ userId: selectedUser, amount: adjustBeans });
    } else if (actionType === 'adjustToken') {
      if (adjustToken === 0) return;
      adjustTokenMutation.mutate({ userId: selectedUser, amount: adjustToken });
    } else if (actionType === 'ban') {
      banUser.mutate({ userId: selectedUser, banType });
    } else if (actionType === 'unban') {
      unbanUser.mutate({ userId: selectedUser, banType });
    } else if (actionType === 'delete') {
      if (!confirm('确定要删除该用户吗？此操作会清空用户的邮箱、手机号等信息。')) return;
      deleteUser.mutate({ userId: selectedUser, hardDelete: false });
    } else if (actionType === 'hardDelete') {
      if (!confirm('确定要彻底删除该已删除用户吗？这会清空后台占用的 Token/精灵账户信息。')) return;
      deleteUser.mutate({ userId: selectedUser, hardDelete: true });
    } else if (actionType === 'setRole') {
      setUserRoleMutation.mutate({ userId: selectedUser, role: selectedRole as 'free' | 'paid' | 'tester' });
    } else if (actionType === 'setAdmin') {
      setAdminLevelMutation.mutate({ userId: selectedUser, isAdmin: selectedIsAdmin, adminLevel: selectedIsAdmin ? (selectedAdminLevel ?? 1) : null });
    }
  };

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">用户管理</h1>
        <p className="text-sm text-gray-500 mt-1">搜索用户、管理账号状态、调整精灵豆</p>
      </div>

      <UserGroupPanel />

      {/* 搜索 */}
      <form onSubmit={e => { e.preventDefault(); setPage(1); }} className="mb-6 flex gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索昵称 / UID / 邮箱..."
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <button type="submit" className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
          搜索
        </button>
        {search && (
          <button type="button" onClick={() => { setSearch(''); setPage(1); }}
            className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition">
            重置
          </button>
        )}
      </form>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">加载中...</div>
      ) : !data?.users?.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">暂无用户</p>
        </div>
      ) : (
        <>
          {/* 用户列表 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">用户</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">UID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">邮箱</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">限制状态</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">注册时间</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{u.avatarUrl || '👤'}</span>
                        <span className="font-medium">{u.nickname || '未设置'}</span>
                        {u.isDeleted && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">已删除</span>
                        )}
                        {u.isAdmin && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${u.adminLevel === 0 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                            {u.adminLevel === 0 ? '总管' : `L${u.adminLevel}`}
                          </span>
                        )}
                        {!u.isAdmin && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            u.userRole === 'paid' ? 'bg-green-100 text-green-700' :
                            u.userRole === 'tester' ? 'bg-purple-100 text-purple-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {u.userRole === 'paid' ? '付费' : u.userRole === 'tester' ? '测试' : '免费'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.displayId || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">{u.email || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {u.bannedFromPublish && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">禁发布</span>}
                        {u.bannedFromPayment && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">禁充值</span>}
                        {!u.bannedFromPublish && !u.bannedFromPayment && <span className="text-gray-400">正常</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{new Date(u.createdAt).toLocaleDateString('zh-CN')}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleSelectUser(u)}
                        className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition">
                        管理
                      </button>
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

      {/* 操作弹窗 */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { setSelectedUser(null); setActionType(null); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">用户操作 — {selectedUserNickname}</h3>

            {/* 用户信息 */}
            {userDetail && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Token余额</span><span className="font-medium">{(selectedUserTokenBalance ?? 0).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Token累计消费</span><span className="font-medium">{(selectedUserTokenConsumed ?? 0).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">精灵豆余额</span><span className="font-medium">{selectedUserBeanBalance ?? 0}</span></div>
              </div>
            )}

            {/* 操作类型选择 */}
            {!actionType && (
              <div className="space-y-2">
                <button onClick={() => setActionType('adjustBeans')}
                  className="w-full text-left px-4 py-3 rounded-lg border hover:bg-gray-50 transition">
                  <span className="font-medium">增减精灵豆</span>
                </button>
                <button onClick={() => setActionType('adjustToken')}
                  className="w-full text-left px-4 py-3 rounded-lg border hover:bg-gray-50 transition">
                  <span className="font-medium">增减 Token</span>
                </button>
                <button onClick={() => setActionType('setRole')}
                  className="w-full text-left px-4 py-3 rounded-lg border hover:bg-gray-50 transition">
                  <span className="font-medium">设置用户角色</span>
                  <span className="text-xs text-gray-400 ml-2">免费/付费/测试</span>
                </button>
                <button onClick={() => setActionType('setAdmin')}
                  className="w-full text-left px-4 py-3 rounded-lg border hover:bg-gray-50 transition">
                  <span className="font-medium">设置管理员</span>
                  <span className="text-xs text-gray-400 ml-2">管理员等级</span>
                </button>
                <button onClick={() => setActionType('ban')}
                  className="w-full text-left px-4 py-3 rounded-lg border hover:bg-gray-50 transition">
                  <span className="font-medium">禁止操作</span>
                </button>
                <button onClick={() => setActionType('unban')}
                  className="w-full text-left px-4 py-3 rounded-lg border hover:bg-gray-50 transition">
                  <span className="font-medium">解除禁止</span>
                </button>
                <button onClick={() => setActionType('delete')}
                  className="w-full text-left px-4 py-3 rounded-lg border border-red-200 hover:bg-red-50 transition">
                  <span className="font-medium text-red-600">删除账号</span>
                </button>
                {userDetail?.nickname === '已删除用户' && !userDetail?.email && !userDetail?.phone && (
                  <button onClick={() => setActionType('hardDelete')}
                    className="w-full text-left px-4 py-3 rounded-lg border border-red-300 hover:bg-red-100 transition">
                    <span className="font-medium text-red-700">彻底删除并清空后台占用</span>
                  </button>
                )}
              </div>
            )}

            {/* 增减精灵豆 */}
            {actionType === 'adjustBeans' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">当前精灵豆：<span className="font-medium">{selectedUserBeanBalance}</span></p>
                <label className="block text-sm font-medium text-gray-700">数量（正数=增加，负数=减少）</label>
                <input type="number" value={adjustBeans} onChange={e => setAdjustBeans(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                <p className="text-xs text-gray-400">示例：+100 增加100豆，-50 减少50豆</p>
                <div className="flex gap-2">
                  <button onClick={handleAction} disabled={adjustBeans === 0 || adjustBeansMutation.isPending}
                    className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                    确认
                  </button>
                  <button onClick={() => setActionType(null)}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition">返回</button>
                </div>
              </div>
            )}

            {/* 增减 Token */}
            {actionType === 'adjustToken' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">当前 Token 余额：<span className="font-medium">{(selectedUserTokenBalance ?? 0).toLocaleString()}</span></p>
                <label className="block text-sm font-medium text-gray-700">数量（正数=增加，负数=减少）</label>
                <input type="number" value={adjustToken} onChange={e => setAdjustToken(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                <p className="text-xs text-gray-400">示例：+1000000 增加1百万，-500000 减少50万（内部精度）</p>
                <div className="flex gap-2">
                  <button onClick={handleAction} disabled={adjustToken === 0 || adjustTokenMutation.isPending}
                    className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                    确认
                  </button>
                  <button onClick={() => setActionType(null)}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition">返回</button>
                </div>
              </div>
            )}

            {/* 禁止操作 */}
            {actionType === 'ban' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  {(['publish', 'payment', 'all'] as const).map(t => (
                    <button key={t} onClick={() => setBanType(t)}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                        banType === t ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'
                      }`}>
                      {t === 'publish' ? '禁止发布' : t === 'payment' ? '禁止充值' : '全部禁止'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAction} disabled={banUser.isPending}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-50">
                    确认禁止
                  </button>
                  <button onClick={() => setActionType(null)}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition">返回</button>
                </div>
              </div>
            )}

            {/* 解除禁止 */}
            {actionType === 'unban' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  {(['publish', 'payment', 'all'] as const).map(t => (
                    <button key={t} onClick={() => setBanType(t)}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                        banType === t ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'
                      }`}>
                      {t === 'publish' ? '解除发布限制' : t === 'payment' ? '解除充值限制' : '解除所有限制'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAction} disabled={unbanUser.isPending}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50">
                    确认解除
                  </button>
                  <button onClick={() => setActionType(null)}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition">返回</button>
                </div>
              </div>
            )}

            {/* 设置用户角色 */}
            {actionType === 'setRole' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">当前角色：<span className="font-medium">{selectedRole === 'paid' ? '付费用户' : selectedRole === 'tester' ? '测试用户' : '免费用户'}</span></p>
                <div className="flex gap-2">
                  {(['free', 'paid', 'tester'] as const).map(r => (
                    <button key={r} onClick={() => setSelectedRole(r)}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                        selectedRole === r ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'
                      }`}>
                      {r === 'free' ? '免费用户' : r === 'paid' ? '付费用户' : '测试用户'}
                    </button>
                  ))}
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
                  <p>各角色的每日限额和可用模型由上方「用户组配置」控制</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAction} disabled={setUserRoleMutation.isPending}
                    className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                    确认
                  </button>
                  <button onClick={() => setActionType(null)}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition">返回</button>
                </div>
              </div>
            )}

            {/* 设置管理员 */}
            {actionType === 'setAdmin' && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">管理员身份</label>
                  <button onClick={() => setSelectedIsAdmin(!selectedIsAdmin)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                      selectedIsAdmin ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'
                    }`}>
                    {selectedIsAdmin ? '是管理员' : '非管理员'}
                  </button>
                </div>
                {selectedIsAdmin && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">管理员等级</label>
                    <div className="flex gap-2 flex-wrap">
                      {[1, 2, 3].map(level => (
                        <button key={level} onClick={() => setSelectedAdminLevel(level)}
                          className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                            selectedAdminLevel === level ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'
                          }`}>
                          {level === 1 ? '一级管理员' : level === 2 ? '二级管理员' : '三级管理员'}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
                      <p>一级管理员：用户管理、付费管理、模板审核、预设管理</p>
                      <p>二级管理员：模板审核、预设管理只读</p>
                      <p>三级管理员：仅模板审核</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={handleAction} disabled={setAdminLevelMutation.isPending}
                    className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                    确认
                  </button>
                  <button onClick={() => setActionType(null)}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition">返回</button>
                </div>
              </div>
            )}

            {actionType === 'delete' && (
              <div className="space-y-3">
                <p className="text-sm text-red-600">删除后将清空该用户的邮箱、手机号等注册信息，但保留账户数据。</p>
                <div className="flex gap-2">
                  <button onClick={handleAction} disabled={deleteUser.isPending}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-50">
                    确认删除
                  </button>
                  <button onClick={() => setActionType(null)}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition">返回</button>
                </div>
              </div>
            )}

            {actionType === 'hardDelete' && (
              <div className="space-y-3">
                <p className="text-sm text-red-700">仅对已删除用户开放。执行后会清空该用户在后台占用的 Token 账户与精灵账户信息。</p>
                <div className="flex gap-2">
                  <button onClick={handleAction} disabled={deleteUser.isPending}
                    className="flex-1 px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-800 transition disabled:opacity-50">
                    确认彻底删除
                  </button>
                  <button onClick={() => setActionType(null)}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition">返回</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
