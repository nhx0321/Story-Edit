'use client';

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';

type BarDatum = {
  label: string;
  value: number;
  color?: string;
  topLabel?: string;
  title?: string;
};

function formatCompactTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return value.toString();
}

function BarChart({ data }: { data: BarDatum[] }) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-56">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <span className="text-xs text-gray-500 font-medium text-center leading-tight">
            {d.topLabel ?? (d.value > 0 ? formatCompactTokens(d.value) : '0')}
          </span>
          <div
            className="w-full rounded-t-md transition-all hover:opacity-80 min-h-[4px]"
            style={{
              height: `${Math.max((d.value / maxVal) * 140, 4)}px`,
              backgroundColor: d.color || '#1f2937',
            }}
            title={d.title || `${d.label}: ${d.value.toLocaleString()} Token`}
          />
          <span className="text-xs text-gray-400 truncate w-full text-center" title={d.label}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function AIConfigConsumptionPage() {
  const { data: stats, isLoading, refetch } = trpc.token.getConsumptionStats.useQuery();

  const modelRows = useMemo(() => {
    return Object.entries(stats?.byModel ?? {})
      .filter(([, item]) => (item.todayTokens ?? 0) > 0)
      .sort((a, b) => (b[1].todayTokens ?? 0) - (a[1].todayTokens ?? 0));
  }, [stats?.byModel]);

  const totalTokens = stats?.todayTokens ?? 0;
  const totalInput = stats?.todayInput ?? 0;
  const totalOutput = stats?.todayOutput ?? 0;

  const modelBarData = useMemo(() => {
    return modelRows.map(([key, item]) => {
      const pct = totalTokens > 0 ? ((item.todayTokens ?? 0) / totalTokens) * 100 : 0;
      return {
        label: key,
        value: item.todayTokens ?? 0,
        topLabel: `${pct.toFixed(1)}% · ${formatCompactTokens(item.todayTokens ?? 0)}`,
        title: `${key}\n今日总消耗：${(item.todayTokens ?? 0).toLocaleString()} Token\n输入：${(item.todayInput ?? 0).toLocaleString()} Token\n输出：${(item.todayOutput ?? 0).toLocaleString()} Token\n调用：${(item.todayCallCount ?? 0).toLocaleString()} 次\n占比：${pct.toFixed(2)}%`,
      };
    });
  }, [modelRows, totalTokens]);

  const handleRefresh = () => {
    refetch();
  };

  return (
    <div className="max-w-5xl mx-auto">
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">当日总用量</p>
              <p className="text-xl font-bold">{totalTokens.toLocaleString()} Token</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">当日输入</p>
              <p className="text-xl font-bold text-blue-600">{totalInput.toLocaleString()} Token</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">当日输出</p>
              <p className="text-xl font-bold text-emerald-600">{totalOutput.toLocaleString()} Token</p>
            </div>
          </div>

          {modelBarData.length > 0 ? (
            <>
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                <h2 className="text-sm font-medium mb-2">今日各模型消耗占比</h2>
                <p className="text-xs text-gray-400 mb-4">柱顶显示“占比 + 消耗量”，鼠标移到柱体上可查看输入、输出与调用次数</p>
                <BarChart data={modelBarData} />
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">模型</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">输入 Token</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">输出 Token</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">合计</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">占比</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">调用次数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelRows.map(([key, item]) => {
                      const pct = totalTokens > 0 ? ((item.todayTokens ?? 0) / totalTokens) * 100 : 0;
                      return (
                        <tr key={key} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-700">{key}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{(item.todayInput ?? 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{(item.todayOutput ?? 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-medium">{(item.todayTokens ?? 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{pct.toFixed(2)}%</td>
                          <td className="px-4 py-3 text-right text-gray-600">{(item.todayCallCount ?? 0).toLocaleString()}</td>
                        </tr>
                      );
                    })}
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
