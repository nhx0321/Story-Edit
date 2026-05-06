'use client';

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import Link from 'next/link';

export default function AIConfigTokensPage() {
  const { data: account, isLoading } = trpc.token.getAccount.useQuery();
  const { data: stats } = trpc.token.getConsumptionStats.useQuery();
  const setAlertMutation = trpc.token.setAlertThreshold.useMutation();
  const utils = trpc.useUtils();

  const totalRecharged = account?.totalRecharged ?? 0;
  const accountRole = account?.role ?? 'free';
  const roleLabel = accountRole === 'admin'
    ? '管理员'
    : accountRole === 'paid'
      ? '付费用户'
      : accountRole === 'tester'
        ? '测试用户'
        : '免费用户';
  const freeDailyLimit = account?.freeDailyLimit ?? account?.dailyLimit ?? 100_000;
  const freeModelDailyUsed = account?.freeDailyUsed ?? account?.dailyUsed ?? 0;
  const freeDailyRemaining = account?.freeDailyRemaining ?? Math.max(freeDailyLimit - freeModelDailyUsed, 0);
  const hasUnlimitedFreeDailyLimit = account?.hasUnlimitedFreeDailyLimit ?? freeDailyLimit === 0;
  const dailyConsumed = stats?.todayTokens ?? 0;
  const modelStatsEntries = useMemo(() => Object.entries(stats?.byModel ?? {}).filter(([, data]) => (
    (data.todayTokens ?? 0) > 0 || (data.totalTokens ?? 0) > 0
  )), [stats?.byModel]);
  const hasModelConsumption = modelStatsEntries.length > 0;
  const alertThreshold = account?.alertThreshold;
  const alertEnabled = account?.alertEnabled ?? false;

  const dailyPercent = !hasUnlimitedFreeDailyLimit && freeDailyLimit > 0
    ? Math.round((freeModelDailyUsed / freeDailyLimit) * 100)
    : 0;

  if (isLoading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">免费 Token 用量</h1>

      {/* 余额卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-medium text-gray-500 mb-1">剩余免费 Token 用量</h2>
          <p className="text-3xl font-bold text-gray-900">{hasUnlimitedFreeDailyLimit ? '不限额' : freeDailyRemaining.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">
            {hasUnlimitedFreeDailyLimit
              ? `当前分组：${roleLabel}，免费模型不受日限额限制`
              : `当前分组：${roleLabel}，已用 ${freeModelDailyUsed.toLocaleString()} / ${freeDailyLimit.toLocaleString()} Token`}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-medium text-gray-500 mb-1">今日消耗</h2>
          <p className="text-3xl font-bold text-gray-900">{dailyConsumed.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">按全部站内模型汇总输入 + 输出 Token</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-medium text-gray-500 mb-1">免费模型今日已用</h2>
          <p className="text-3xl font-bold text-gray-900">{freeModelDailyUsed.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">
            {hasUnlimitedFreeDailyLimit
              ? `当前分组：${roleLabel}，免费模型不计入日限额`
              : `当前分组日限额 ${freeDailyLimit.toLocaleString()} Token`}
          </p>
          {!hasUnlimitedFreeDailyLimit && (
            <>
              <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${dailyPercent >= 80 ? 'bg-red-500' : dailyPercent >= 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(dailyPercent, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">仅统计今日免费模型消耗；收费模型不计入该限额</p>
            </>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-medium text-gray-500 mb-1">累计 Token 统计</h2>
          <p className="text-sm mt-3">
            <span className="text-gray-500">累计充值：</span>
            <span className="font-medium">{totalRecharged.toLocaleString()} Token</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">按系统账户累计发放的 Token 额度统计</p>
        </div>
      </div>

      {/* 消耗分布 */}
      {hasModelConsumption && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold mb-4">模型消耗分布</h2>
          <div className="space-y-3">
            {modelStatsEntries.map(([key, data]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <div>
                  <span className="text-sm text-gray-600 block">{key}</span>
                  <span className="text-xs text-gray-400">今日 {data.todayTokens.toLocaleString()} tokens / 累计 {data.totalTokens.toLocaleString()} tokens</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium text-gray-900">今日 {data.todayCallCount.toLocaleString()} 次</span>
                  <span className="text-xs text-gray-400 block">累计 {data.callCount.toLocaleString()} 次</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100">
            <Link href="/ai-config/consumption" className="text-sm text-gray-900 hover:underline font-medium">
              查看站内用量统计 &rarr;
            </Link>
          </div>
        </div>
      )}

      {/* 站内用量统计入口（无消耗时也显示） */}
      {!hasModelConsumption && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold mb-2">站内用量统计</h2>
          <p className="text-sm text-gray-500 mb-3">查看详细的站内 Token 消费记录</p>
          <Link href="/ai-config/consumption" className="text-sm text-gray-900 hover:underline font-medium">
            查看站内用量统计 &rarr;
          </Link>
        </div>
      )}

      {/* 预警设置 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold mb-4">额度预警</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={alertEnabled}
              onChange={e => setAlertMutation.mutate({
                threshold: alertThreshold ?? 1000000,
                enabled: e.target.checked,
              }, { onSuccess: () => utils.token.getAccount.invalidate() })}
              className="rounded"
            />
            开启预警
          </label>
          {alertEnabled && (
            <>
              <span className="text-sm text-gray-500">当余额低于</span>
              <input
                type="number"
                value={Math.round((alertThreshold ?? 1000000) / 10_000_000 * 1_000_000)}
                onChange={e => {
                  const tokens = parseInt(e.target.value) || 0;
                  const units = Math.round(tokens / 1_000_000 * 10_000_000);
                  setAlertMutation.mutate({ threshold: units, enabled: true }, {
                    onSuccess: () => utils.token.getAccount.invalidate(),
                  });
                }}
                className="w-32 px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
              />
              <span className="text-sm text-gray-500">token 时提醒</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
