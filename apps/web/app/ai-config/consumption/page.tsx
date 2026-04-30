'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';

function BarChart({ data }: { data: { label: string; value: number; color?: string }[] }) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-48">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <span className="text-xs text-gray-500 font-medium">
            {d.value > 0 ? (d.value / 1000).toFixed(0) + 'K' : '0'}
          </span>
          <div
            className="w-full rounded-t-md transition-all hover:opacity-80 min-h-[4px]"
            style={{
              height: `${Math.max((d.value / maxVal) * 140, 4)}px`,
              backgroundColor: d.color || '#1f2937',
            }}
            title={`${d.label}: ${d.value.toLocaleString()} tokens`}
          />
          <span className="text-xs text-gray-400 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function AIConfigConsumptionPage() {
  // Query today's data only (from 00:00 to now)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: logs, isLoading, refetch } = trpc.token.getConsumption.useQuery({
    limit: 10000,
    startDate: todayStart.toISOString(),
  });

  // Aggregate by hour for today
  const hourlyData = useMemo(() => {
    if (!logs || logs.length === 0) return [];
    const byHour: Record<number, { tokens: number; inputTokens: number; outputTokens: number; cost: number }> = {};
    // Initialize all 24 hours
    for (let h = 0; h < 24; h++) {
      byHour[h] = { tokens: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
    }
    for (const log of logs as any[]) {
      const d = new Date(log.createdAt);
      const hour = d.getHours();
      byHour[hour].tokens += (log.inputTokens ?? 0) + (log.outputTokens ?? 0);
      byHour[hour].inputTokens += (log.inputTokens ?? 0);
      byHour[hour].outputTokens += (log.outputTokens ?? 0);
      byHour[hour].cost += (log.cost ?? 0);
    }
    const currentHour = new Date().getHours();
    return Array.from({ length: currentHour + 1 }, (_, h) => ({
      hour: h,
      label: `${h}:00`,
      ...byHour[h],
    }));
  }, [logs]);

  const toTokens = (units: number) => Math.round(units / 10_000_000 * 1_000_000);

  const barData = hourlyData.map(m => ({ label: m.label, value: m.tokens }));
  const inputBarData = hourlyData.map(m => ({ label: m.label, value: m.inputTokens, color: '#3b82f6' }));
  const outputBarData = hourlyData.map(m => ({ label: m.label, value: m.outputTokens, color: '#10b981' }));

  const totalTokens = hourlyData.reduce((s, m) => s + m.tokens, 0);
  const totalInput = hourlyData.reduce((s, m) => s + m.inputTokens, 0);
  const totalOutput = hourlyData.reduce((s, m) => s + m.outputTokens, 0);
  const totalCost = hourlyData.reduce((s, m) => s + m.cost, 0);

  const handleRefresh = () => {
    refetch();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">站内用量统计</h1>
          <p className="text-sm text-gray-400 mt-1">当日统计，每日 0:00 刷新</p>
        </div>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          刷新
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">加载中...</div>
      ) : (
        <>
          {/* 当日概览 */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">当日总用量</p>
              <p className="text-xl font-bold">{totalTokens > 0 ? (totalTokens / 1000).toFixed(0) + 'K' : '0'} tokens</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">当日输入</p>
              <p className="text-xl font-bold text-blue-600">{totalInput > 0 ? (totalInput / 1000).toFixed(0) + 'K' : '0'} tokens</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">当日输出</p>
              <p className="text-xl font-bold text-emerald-600">{totalOutput > 0 ? (totalOutput / 1000).toFixed(0) + 'K' : '0'} tokens</p>
            </div>
          </div>

          {/* 每小时用量柱状图 */}
          {hourlyData.length > 0 && totalTokens > 0 ? (
            <>
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                <h2 className="text-sm font-medium mb-4">当日每小时用量</h2>
                <BarChart data={barData} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    输入 Token
                  </h2>
                  <BarChart data={inputBarData} />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    输出 Token
                  </h2>
                  <BarChart data={outputBarData} />
                </div>
              </div>

              {/* 每小时明细表 */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">时段</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">输入 Token</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">输出 Token</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">合计</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">费用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hourlyData.filter(m => m.tokens > 0).map(m => (
                      <tr key={m.hour} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-700">{m.label}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{m.inputTokens.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{m.outputTokens.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-medium">{m.tokens.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gray-700">~{toTokens(m.cost).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
              今日暂无消费记录
            </div>
          )}
        </>
      )}
    </div>
  );
}
