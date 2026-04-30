'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';

export default function AIConfigTokensPage() {
  const { data: account, isLoading } = trpc.token.getAccount.useQuery();
  const { data: stats } = trpc.token.getConsumptionStats.useQuery();
  const setAlertMutation = trpc.token.setAlertThreshold.useMutation();
  const utils = trpc.useUtils();

  if (isLoading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  const balance = account?.balance ?? 0;
  const totalConsumed = account?.totalConsumed ?? 0;
  const totalRecharged = account?.totalRecharged ?? 0;
  const dailyLimit = account?.dailyLimit ?? 100_000;
  const dailyUsed = account?.dailyUsed ?? 0;
  const alertThreshold = account?.alertThreshold;
  const alertEnabled = account?.alertEnabled ?? false;

  // 转换为可读单位（1元 = 10,000,000 内部单位）
  const toYuan = (units: number) => (units / 10_000_000).toFixed(4);
  const toTokens = (units: number) => {
    // 粗略估算：1元约等于100万token（对于deepseek价格）
    return Math.round(units / 10_000_000 * 1_000_000);
  };

  const dailyPercent = dailyLimit > 0 ? Math.round((dailyUsed / dailyLimit) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">Token 余额</h1>

      {/* 余额卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-medium text-gray-500 mb-1">Token 余额</h2>
          <p className="text-3xl font-bold text-gray-900">{toTokens(balance).toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">≈ ¥{toYuan(balance)}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-medium text-gray-500 mb-1">今日消耗</h2>
          <p className="text-3xl font-bold text-gray-900">{dailyUsed.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">免费模型日限额 {dailyLimit.toLocaleString()} Token</p>
          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${dailyPercent >= 80 ? 'bg-red-500' : dailyPercent >= 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(dailyPercent, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">仅统计今日免费模型消耗；收费模型不计入该限额</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-medium text-gray-500 mb-1">累计统计</h2>
          <p className="text-sm mt-3">
            <span className="text-gray-500">累计消费：</span>
            <span className="font-medium">{toTokens(totalConsumed).toLocaleString()} Token</span>
          </p>
          <p className="text-sm mt-1">
            <span className="text-gray-500">累计充值：</span>
            <span className="font-medium">{toTokens(totalRecharged).toLocaleString()} Token</span>
          </p>
        </div>
      </div>

      {/* 消耗分布 */}
      {stats && stats.totalCost > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold mb-4">模型消耗分布</h2>
          <div className="space-y-3">
            {Object.entries(stats.byModel).map(([key, data]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{key}</span>
                <span className="text-sm font-medium">{toTokens(data.totalCost).toLocaleString()} token</span>
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
      {(!stats || stats.totalCost === 0) && (
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
