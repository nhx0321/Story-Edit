'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

// 内部精度转可读单位
const UNITS_PER_YUAN = 10_000_000;
const toTokens = (units: number) => Math.round(units / UNITS_PER_YUAN * 1_000_000);
const toYuan = (units: number) => (units / UNITS_PER_YUAN).toFixed(2);

const paymentLabels: Record<string, string> = {
  wechat: '微信',
  alipay: '支付宝',
};

export default function RevenuePage() {
  const [tab, setTab] = useState<'revenue' | 'billing'>('revenue');

  return (
    <>
      <div className="flex gap-4 border-b border-gray-200 mb-6">
        <button
          onClick={() => setTab('revenue')}
          className={`pb-2 text-sm font-medium border-b-2 transition ${
            tab === 'revenue' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          营收仪表盘
        </button>
        <button
          onClick={() => setTab('billing')}
          className={`pb-2 text-sm font-medium border-b-2 transition ${
            tab === 'billing' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          付费管理
        </button>
      </div>
      {tab === 'revenue' ? <RevenueTab /> : <BillingTab />}
    </>
  );
}

function BillingTab() {
  const { data: stats, isLoading: statsLoading } = trpc.spriteBean.adminGetRevenueStats.useQuery();

  if (statsLoading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">付费管理</h1>
        <p className="text-sm text-gray-500 mt-1">查看充值收益、统计付费数据</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <BillingStatCard label="今日" data={stats.today} />
          <BillingStatCard label="本月" data={stats.month} />
          <BillingStatCard label="本年" data={stats.year} />
          <BillingStatCard label="总计" data={stats.total} />
        </div>
      )}

      {stats && stats.paymentStats && Object.keys(stats.paymentStats).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold mb-4">按支付方式统计</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(stats.paymentStats).map(([method, s]) => (
              <div key={method} className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium mb-2">{paymentLabels[method] || method}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold">{s.count}</p>
                    <p className="text-xs text-gray-400">订单</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-green-600">¥{(s.amount / 100).toFixed(2)}</p>
                    <p className="text-xs text-gray-400">收入</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-blue-600">{s.beans}</p>
                    <p className="text-xs text-gray-400">精灵豆</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BillingStatCard({ label, data }: { label: string; data: { orderCount: number; totalBeans: number; totalAmountCents: number; totalAmountYuan: number } }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold">¥{data.totalAmountYuan.toFixed(2)}</p>
      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
        <span>{data.orderCount} 笔</span>
        <span>{data.totalBeans} 豆</span>
      </div>
    </div>
  );
}

function RevenueTab() {
  const { data: stats, isLoading } = trpc.token.getRevenueStats.useQuery();
  const { data: topConsumers } = trpc.token.getTopConsumers.useQuery({ limit: 20 });
  const { data: trend } = trpc.token.getRevenueTrend.useQuery({ days: 30 });
  const { data: rechargeSetting } = trpc.token.getSystemSetting.useQuery({ key: 'recharge_enabled' });
  const setSettingMutation = trpc.token.setSystemSetting.useMutation();

  const rechargeEnabled = rechargeSetting?.value !== 'false';

  const toggleRecharge = async () => {
    const newValue = rechargeEnabled ? 'false' : 'true';
    await setSettingMutation.mutateAsync({ key: 'recharge_enabled', value: newValue });
    // 手动更新缓存
    rechargeSetting && (rechargeSetting.value = newValue);
  };

  if (isLoading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">营收仪表盘</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">充值购买功能</span>
          <button
            onClick={toggleRecharge}
            disabled={setSettingMutation.isPending}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              rechargeEnabled ? 'bg-green-500' : 'bg-gray-300'
            } ${setSettingMutation.isPending ? 'opacity-50' : ''}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              rechargeEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
          <span className={`text-xs font-medium ${rechargeEnabled ? 'text-green-600' : 'text-gray-400'}`}>
            {rechargeEnabled ? '已开启' : '已关闭'}
          </span>
        </div>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">总充值 (Token)</p>
          <p className="text-2xl font-bold text-gray-900">{toTokens(stats?.totalRecharged ?? 0).toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">¥{toYuan(stats?.totalRecharged ?? 0)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">总消费 (Token)</p>
          <p className="text-2xl font-bold text-gray-900">{toTokens(stats?.totalConsumed ?? 0).toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">¥{toYuan(stats?.totalConsumed ?? 0)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">用户Token余额</p>
          <p className="text-2xl font-bold text-gray-900">{toTokens(stats?.totalBalance ?? 0).toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{stats?.totalAccounts ?? 0} 个账户</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">套餐订单</p>
          <p className="text-2xl font-bold text-gray-900">{stats?.totalOrders ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">¥{((stats?.totalOrderAmount ?? 0) / 100).toFixed(2)}</p>
        </div>
      </div>

      {/* 第二行指标 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">活跃渠道</p>
          <p className="text-2xl font-bold text-gray-900">{stats?.activeChannels ?? 0} / {stats?.totalChannels ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">API Keys</p>
          <p className="text-2xl font-bold text-gray-900">{stats?.activeKeys ?? 0} / {stats?.totalKeys ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">今日渠道消耗</p>
          <p className="text-2xl font-bold text-gray-900">{toTokens(stats?.totalDailyUsed ?? 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">毛利率 (估算)</p>
          {(() => {
            const revenue = stats?.totalRecharged ?? 0;
            const cost = stats?.totalConsumed ?? 0;
            const margin = revenue > 0 ? Math.round((1 - cost / revenue) * 100) : 0;
            return (
              <>
                <p className="text-2xl font-bold text-gray-900">{margin}%</p>
                <p className="text-xs text-gray-400 mt-1">收入¥{toYuan(revenue)} - 成本¥{toYuan(cost)}</p>
              </>
            );
          })()}
        </div>
      </div>

      {/* 用户消耗排名 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <h2 className="font-semibold px-6 py-4 border-b border-gray-100">用户消耗排名 Top 20</h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500 w-12">#</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">用户</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">累计消费</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">累计充值</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">余额</th>
            </tr>
          </thead>
          <tbody>
            {(topConsumers ?? []).map((user: any, i: number) => (
              <tr key={user.userId} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{user.nickname || '未设置'}</p>
                  <p className="text-xs text-gray-400">{user.email}</p>
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-700">
                  {toTokens(user.totalConsumed).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-700">
                  {toTokens(user.totalRecharged).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-700">
                  {toTokens(user.balance).toLocaleString()}
                </td>
              </tr>
            ))}
            {(!topConsumers || topConsumers.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">暂无数据</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 消费趋势 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold mb-4">日消费趋势（最近30天）</h2>
        {trend && trend.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="flex items-end gap-1" style={{ minWidth: '600px', height: '200px' }}>
              {trend.map((d: any) => {
                const maxCost = Math.max(...trend.map((t: any) => t.totalCost), 1);
                const height = Math.max(2, (d.totalCost / maxCost) * 180);
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center group relative" style={{ minWidth: '16px' }}>
                    <div className="w-full bg-gray-200 rounded-t group-hover:bg-gray-900 transition"
                      style={{ height: `${height}px` }} />
                    <span className="text-[9px] text-gray-400 mt-1 rotate-45 origin-left truncate max-w-[40px]">
                      {d.date.slice(5)}
                    </span>
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                      {d.date}: {toTokens(d.totalCost).toLocaleString()} token ({d.count}次)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">暂无消费数据</p>
        )}
      </div>
    </div>
  );
}
