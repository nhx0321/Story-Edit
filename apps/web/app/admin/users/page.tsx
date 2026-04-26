'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

export default function AdminUsersPage() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedUserNickname, setSelectedUserNickname] = useState<string>('');
  const [selectedUserBeanBalance, setSelectedUserBeanBalance] = useState<number>(0);
  const [selectedUserVipDays, setSelectedUserVipDays] = useState<number>(0);
  const [selectedUserTokenBalance, setSelectedUserTokenBalance] = useState<number>(0);
  const [selectedUserTokenConsumed, setSelectedUserTokenConsumed] = useState<number>(0);
  const [actionType, setActionType] = useState<string | null>(null);
  const [adjustDays, setAdjustDays] = useState(0);
  const [adjustBeans, setAdjustBeans] = useState(0);
  const [banType, setBanType] = useState<'publish' | 'payment' | 'all'>('all');

  const { data, isLoading } = trpc.admin.listUsers.useQuery({ search: search || undefined, page, limit: 20 });
  // 获取用户详情（包含精灵豆余额和VIP天数）
  const { data: userDetail } = trpc.admin.getUserDetail.useQuery({ userId: selectedUser || '' }, {
    enabled: !!selectedUser,
  });
  const adjustSub = trpc.admin.adjustSubscription.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setSelectedUser(null); setActionType(null); setAdjustDays(0); },
    onError: (e) => alert(e.message),
  });
  const adjustBeansMutation = trpc.admin.adjustBeans.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setSelectedUser(null); setActionType(null); setAdjustBeans(0); },
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
  const setPlan = trpc.admin.setSubscriptionPlan.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setSelectedUser(null); setActionType(null); },
    onError: (e) => alert(e.message),
  });

  // 当选中用户变化时，获取详情
  const handleSelectUser = (u: any) => {
    setSelectedUser(u.id);
    setSelectedUserNickname(u.nickname || '用户');
    setActionType(null);
    // 获取详情（精灵豆余额、VIP天数）
    utils.client.admin.getUserDetail.query({ userId: u.id }).then(detail => {
      setSelectedUserBeanBalance(detail.beanBalance ?? 0);
      setSelectedUserVipDays(detail.vipDays ?? 0);
      setSelectedUserTokenBalance((detail as any).tokenBalance ?? 0);
      setSelectedUserTokenConsumed((detail as any).tokenConsumed ?? 0);
    }).catch(() => {
      setSelectedUserBeanBalance(0);
      setSelectedUserVipDays(0);
      setSelectedUserTokenBalance(0);
      setSelectedUserTokenConsumed(0);
    });
  };

  const handleAction = () => {
    if (!selectedUser) return;
    if (actionType === 'adjust') {
      if (adjustDays === 0) return;
      adjustSub.mutate({ userId: selectedUser, days: adjustDays });
    } else if (actionType === 'adjustBeans') {
      if (adjustBeans === 0) return;
      adjustBeansMutation.mutate({ userId: selectedUser, amount: adjustBeans });
    } else if (actionType === 'ban') {
      banUser.mutate({ userId: selectedUser, banType });
    } else if (actionType === 'unban') {
      unbanUser.mutate({ userId: selectedUser, banType });
    } else if (actionType === 'delete') {
      if (!confirm('确定要删除该用户吗？此操作会清空用户的邮箱、手机号等信息。')) return;
      deleteUser.mutate({ userId: selectedUser });
    }
  };

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">用户管理</h1>
        <p className="text-sm text-gray-500 mt-1">搜索用户、管理账号状态</p>
      </div>

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
                  <th className="text-left px-4 py-3 font-medium text-gray-500">VIP 等级</th>
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
                        {u.isAdmin && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${u.adminLevel === 0 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                            {u.adminLevel === 0 ? '总管' : `L${u.adminLevel}`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.displayId || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        u.vipLevel === '免费版' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'
                      }`}>{u.vipLevel}</span>
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
                <div className="flex justify-between"><span className="text-gray-500">精灵豆余额</span><span className="font-medium">{userDetail.beanBalance ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">VIP 剩余天数</span><span className="font-medium">{userDetail.vipDays ?? 0} 天</span></div>
              </div>
            )}

            {/* 操作类型选择 */}
            {!actionType && (
              <div className="space-y-2">
                <button onClick={() => setActionType('adjust')}
                  className="w-full text-left px-4 py-3 rounded-lg border hover:bg-gray-50 transition">
                  <span className="font-medium">增减 VIP 时长</span>
                </button>
                <button onClick={() => setActionType('setPremium')}
                  className="w-full text-left px-4 py-3 rounded-lg border border-blue-200 hover:bg-blue-50 transition">
                  <span className="font-medium text-blue-600">设为付费版（365天）</span>
                </button>
                <button onClick={() => setActionType('setFree')}
                  className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition">
                  <span className="font-medium text-gray-600">设为免费版</span>
                </button>
                <button onClick={() => setActionType('adjustBeans')}
                  className="w-full text-left px-4 py-3 rounded-lg border hover:bg-gray-50 transition">
                  <span className="font-medium">增减精灵豆</span>
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
              </div>
            )}

            {/* 增减时长 */}
            {actionType === 'adjust' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">当前 VIP 剩余：<span className="font-medium">{selectedUserVipDays} 天</span></p>
                <label className="block text-sm font-medium text-gray-700">天数（正数=增加，负数=减少）</label>
                <input type="number" value={adjustDays} onChange={e => setAdjustDays(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                <div className="flex gap-2">
                  <button onClick={handleAction} disabled={adjustDays === 0 || adjustSub.isPending}
                    className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                    确认
                  </button>
                  <button onClick={() => setActionType(null)}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition">返回</button>
                </div>
              </div>
            )}

            {/* 设为付费版 */}
            {actionType === 'setPremium' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">将 <span className="font-medium">{selectedUserNickname}</span> 设为 <span className="text-blue-600 font-medium">付费版(365天)</span></p>
                <p className="text-xs text-gray-400">付费版用户将拥有全部功能权限，包括无限项目数、无限 AI 角色、自检、经验沉淀等。</p>
                <div className="flex gap-2">
                  <button onClick={() => setPlan.mutate({ userId: selectedUser!, plan: 'premium', days: 365 })} disabled={setPlan.isPending}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
                    {setPlan.isPending ? '设置中...' : '确认设付费版'}
                  </button>
                  <button onClick={() => setActionType(null)}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition">返回</button>
                </div>
              </div>
            )}

            {/* 设为免费版 */}
            {actionType === 'setFree' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">将 <span className="font-medium">{selectedUserNickname}</span> 设为 <span className="text-gray-600 font-medium">免费版</span></p>
                <p className="text-xs text-gray-400">免费版用户受功能限制：最多1个项目、3个设定、3个AI角色，不支持自检、经验沉淀等高级功能。</p>
                <div className="flex gap-2">
                  <button onClick={() => setPlan.mutate({ userId: selectedUser!, plan: 'free', days: 0 })} disabled={setPlan.isPending}
                    className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition disabled:opacity-50">
                    {setPlan.isPending ? '设置中...' : '确认设免费版'}
                  </button>
                  <button onClick={() => setActionType(null)}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition">返回</button>
                </div>
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

            {/* 删除确认 */}
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
          </div>
        </div>
      )}
    </>
  );
}
