'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

export default function AIUsagePage() {
  const [days, setDays] = useState(7);
  const { data: stats } = trpc.ai.usageStats.useQuery({ days });

  const totalTokens = stats?.byModel.reduce((sum, m) => sum + (m.totalTokens || 0), 0) || 0;
  const totalCalls = stats?.byModel.reduce((sum, m) => sum + (m.callCount || 0), 0) || 0;

  const maxDaily = stats?.daily.length
    ? Math.max(...stats.daily.map(d => d.totalTokens), 1)
    : 1;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">站外用量统计</h1>

      <div className="flex items-center justify-end mb-6">
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
        >
          <option value={7}>最近 7 天</option>
          <option value={30}>最近 30 天</option>
          <option value={90}>最近 90 天</option>
        </select>
      </div>

      {/* 总览卡片 */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">总 Token 用量</p>
          <p className="text-2xl font-bold mt-1">{totalTokens.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">API 调用次数</p>
          <p className="text-2xl font-bold mt-1">{totalCalls}</p>
        </div>
      </div>

      {/* 每日用量柱状图 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold mb-4">每日用量</h2>
        {stats?.daily && stats.daily.length > 0 ? (
          <div className="flex items-end gap-2 h-40">
            {stats.daily.map(d => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-500">{(d.totalTokens / 1000).toFixed(0)}k</span>
                <div
                  className="w-full bg-gray-900 rounded-t"
                  style={{ height: `${(d.totalTokens / maxDaily) * 100}%`, minHeight: 4 }}
                />
                <span className="text-xs text-gray-400">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">暂无用量数据</p>
        )}
      </div>

      {/* 按模型统计 */}
      {stats?.byModel && stats.byModel.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold mb-4">按模型统计</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-2 font-medium">模型</th>
                <th className="pb-2 font-medium text-right">Token 用量</th>
                <th className="pb-2 font-medium text-right">调用次数</th>
              </tr>
            </thead>
            <tbody>
              {stats.byModel.map(m => (
                <tr key={m.provider + m.model} className="border-b border-gray-50">
                  <td className="py-3">
                    <span className="font-medium">{m.provider}</span>
                    <span className="text-gray-400 ml-2">{m.model}</span>
                  </td>
                  <td className="py-3 text-right">{m.totalTokens.toLocaleString()}</td>
                  <td className="py-3 text-right">{m.callCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
