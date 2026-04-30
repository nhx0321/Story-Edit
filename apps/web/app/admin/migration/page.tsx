'use client';

import { trpc } from '@/lib/trpc';

const UNITS_PER_YUAN = 10_000_000;

function toYuan(units: number): string {
  return (units / UNITS_PER_YUAN).toFixed(2);
}

export default function MigrationPage() {
  const { data: stats, isLoading } = trpc.migration.getStats.useQuery();

  if (isLoading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">历史迁移（内部工具）</h1>
      <p className="text-sm text-gray-500 mb-8">旧体系（精灵豆 + VIP）→ 新体系（Token账户）的历史资产迁移记录，仅用于管理员核对遗留数据。</p>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">总用户数</p>
          <p className="text-2xl font-bold">{stats?.totalUsers ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">已迁移</p>
          <p className="text-2xl font-bold text-green-600">{stats?.migratedUsers ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">待迁移</p>
          <p className="text-2xl font-bold text-amber-600">{stats?.pendingUsers ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">已迁移金额</p>
          <p className="text-2xl font-bold">¥{toYuan(stats?.totalUnitsMigrated ?? 0)}</p>
        </div>
      </div>

      {/* 迁移明细 */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400">精灵豆已转换</p>
          <p className="text-lg font-semibold">{stats?.totalBeansMigrated ?? 0} 豆</p>
          <p className="text-xs text-gray-400 mt-1">¥{toYuan((stats?.totalBeansMigrated ?? 0) * 100_000)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400">VIP天数已转换</p>
          <p className="text-lg font-semibold">{stats?.totalVipDaysMigrated ?? 0} 天</p>
          <p className="text-xs text-gray-400 mt-1">¥{toYuan((stats?.totalVipDaysMigrated ?? 0) * 5_000_000)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400">兑换比率</p>
          <p className="text-sm font-medium">1精灵豆 = ¥0.01</p>
          <p className="text-sm font-medium">1天VIP = ¥0.50</p>
        </div>
      </div>

      {/* 提示信息 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-medium mb-2">迁移已完成</h3>
        <p className="text-xs text-gray-500">
          旧体系的资产迁移工具。当前系统已不再产生新的 VIP 数据，如有未迁移的旧用户数据，请联系开发人员处理。
        </p>
      </div>
    </div>
  );
}
