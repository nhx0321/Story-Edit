'use client';

import { trpc } from '@/lib/trpc';

const paymentLabels: Record<string, string> = {
  wechat: '微信',
  alipay: '支付宝',
};

export default function AdminBillingPage() {
  const { data: stats, isLoading: statsLoading } = trpc.spriteBean.adminGetRevenueStats.useQuery();

  if (statsLoading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">付费管理</h1>
        <p className="text-sm text-gray-500 mt-1">查看精灵豆充值订单、统计收益</p>
      </div>

      {/* 收益统计 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="今日" data={stats.today} />
          <StatCard label="本月" data={stats.month} />
          <StatCard label="本年" data={stats.year} />
          <StatCard label="总计" data={stats.total} />
        </div>
      )}

      {/* 按支付方式统计 */}
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

function StatCard({ label, data }: { label: string; data: { orderCount: number; totalBeans: number; totalAmountCents: number; totalAmountYuan: number } }) {
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
