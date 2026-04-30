'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';

function BarChart({ data }: { data: { label: string; value: number; color?: string }[] }) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-48">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <span className="text-xs text-gray-500 font-medium">
            {d.value > 0 ? (d.value / 1000).toFixed(0) + 'K' : ''}
          </span>
          <div
            className="w-full rounded-t-md transition-all hover:opacity-80 min-h-[4px]"
            style={{
              height: `${Math.max((d.value / maxVal) * 140, 4)}px`,
              backgroundColor: d.color || '#1f2937',
            }}
            title={`${d.label}: ${d.value.toLocaleString()}`}
          />
          <span className="text-xs text-gray-400 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-600">今日用量 / 日限额</span>
        <span className="font-medium">{used.toLocaleString()} / {limit.toLocaleString()} ({pct.toFixed(1)}%)</span>
      </div>
      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ChannelDetailPage() {
  const { id: channelId } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = trpc.token.getChannelDetail.useQuery({ channelId });
  const updateMutation = trpc.token.updateChannel.useMutation({ onSuccess: () => refetch() });

  const toTokens = (units: number) => Math.round(units / 10_000_000 * 1_000_000);

  // API管理状态
  const [editingApi, setEditingApi] = useState(false);
  const [apiForm, setApiForm] = useState({ baseUrl: '', apiKeyPlain: '' });

  const hourlyBarData = useMemo(() => {
    if (!data?.hourlyData) return [];
    return data.hourlyData.map(h => ({
      label: h.label,
      value: h.inputTokens + h.outputTokens,
    }));
  }, [data]);

  const inputBarData = useMemo(() => {
    if (!data?.hourlyData) return [];
    return data.hourlyData.map(h => ({ label: h.label, value: h.inputTokens, color: '#3b82f6' }));
  }, [data]);

  const outputBarData = useMemo(() => {
    if (!data?.hourlyData) return [];
    return data.hourlyData.map(h => ({ label: h.label, value: h.outputTokens, color: '#10b981' }));
  }, [data]);

  // 用户占比饼图数据
  const userPieData = useMemo(() => {
    if (!data?.userRanking || data.totalCost === 0) return [];
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    return data.userRanking.map((u, i) => ({
      userId: u.userId.slice(0, 8) + '...',
      cost: u.cost,
      count: u.count,
      pct: ((u.cost / data.totalCost) * 100).toFixed(1),
      color: colors[i % colors.length],
    }));
  }, [data]);

  // 月度每日柱状图数据
  const monthlyBarData = useMemo(() => {
    if (!data?.monthlyData) return [];
    return data.monthlyData.map((d: any) => ({
      label: d.label,
      value: d.inputTokens + d.outputTokens,
    }));
  }, [data]);

  if (isLoading) return <div className="text-center py-16 text-gray-400">加载中...</div>;
  if (error) return (
    <div className="text-center py-16">
      <p className="text-red-500 mb-2">加载渠道详情失败</p>
      <p className="text-sm text-gray-400">{error.message}</p>
      <Link href="/admin/channels" className="text-sm text-blue-500 hover:underline mt-4 inline-block">&larr; 返回渠道管理</Link>
    </div>
  );
  if (!data) return <div className="text-center py-16 text-gray-400">渠道不存在</div>;

  const { channel } = data;
  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    disabled: 'bg-gray-100 text-gray-500',
    rate_limited: 'bg-red-100 text-red-700',
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/admin/channels" className="text-sm text-gray-400 hover:text-gray-600">&larr; 返回渠道管理</Link>
          <h1 className="text-2xl font-bold mt-1">{channel.name || channel.provider}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-500">{channel.provider}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[channel.status ?? 'active'] || 'bg-gray-100 text-gray-500'}`}>
              {channel.status}
            </span>
            <span className="text-xs text-gray-400">优先级 {channel.priority} · 权重 {channel.weight}</span>
          </div>
        </div>
        <button onClick={() => refetch()}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          刷新
        </button>
      </div>

      {/* 总用量进度条 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <ProgressBar used={Number(channel.dailyUsed ?? 0)} limit={Number(channel.dailyLimit ?? 5000000)} />
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">今日请求数</p>
          <p className="text-xl font-bold">{data.totalRequests.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">今日消耗</p>
          <p className="text-xl font-bold">{toTokens(data.totalCost).toLocaleString()} Token</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">活跃用户</p>
          <p className="text-xl font-bold">{data.userRanking.length}</p>
        </div>
      </div>

      {/* 每小时用量柱状图 */}
      {data.totalRequests > 0 ? (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="text-sm font-medium mb-4">每小时总用量</h2>
            <BarChart data={hourlyBarData} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> 输入 Token
              </h2>
              <BarChart data={inputBarData} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> 输出 Token
              </h2>
              <BarChart data={outputBarData} />
            </div>
          </div>

          {/* 用户用量占比 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="text-sm font-medium mb-4">用户用量占比（Top 20）</h2>
            {userPieData.length > 0 ? (
              <>
                {/* 横向占比条 */}
                <div className="h-6 rounded-full overflow-hidden flex mb-4">
                  {userPieData.map((u, i) => (
                    <div key={i} style={{ width: `${u.pct}%`, backgroundColor: u.color }}
                      className="h-full min-w-[2px]"
                      title={`${u.userId}: ${u.pct}%`} />
                  ))}
                </div>
                {/* 用户列表 */}
                <div className="space-y-1.5">
                  {userPieData.map((u, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: u.color }} />
                        <span className="text-gray-600 font-mono text-xs">{u.userId}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-gray-500">{u.count} 次</span>
                        <span className="font-medium">{u.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">今日暂无用户数据</p>
            )}
          </div>

          {/* 每小时明细表 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">时段</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">请求数</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">输入 Token</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">输出 Token</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">消耗</th>
                </tr>
              </thead>
              <tbody>
                {data.hourlyData.filter(h => h.count > 0).map(h => (
                  <tr key={h.hour} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-700">{h.label}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{h.count}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{h.inputTokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{h.outputTokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-medium">{toTokens(h.cost).toLocaleString()}</td>
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

      {/* 月度统计 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mt-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">月度统计</h2>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500">本月请求 <span className="font-bold text-gray-900">{(data.monthTotalRequests ?? 0).toLocaleString()}</span></span>
            <span className="text-gray-500">本月消耗 <span className="font-bold text-gray-900">{toTokens(data.monthTotalCost ?? 0).toLocaleString()} Token</span></span>
          </div>
        </div>
        {monthlyBarData.length > 0 ? (
          <BarChart data={monthlyBarData} />
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">本月暂无数据</p>
        )}
      </div>

      {/* API 配置管理 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">API 配置</h2>
          {!editingApi && (
            <button
              onClick={() => { setApiForm({ baseUrl: channel.baseUrl || '', apiKeyPlain: '' }); setEditingApi(true); }}
              className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
            >
              编辑
            </button>
          )}
        </div>
        {editingApi ? (
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">请求地址（Base URL）</label>
              <input
                type="text"
                value={apiForm.baseUrl}
                onChange={e => setApiForm(f => ({ ...f, baseUrl: e.target.value }))}
                placeholder="如: https://api.deepseek.com/v1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">API Key（留空则不修改）</label>
              <input
                type="password"
                value={apiForm.apiKeyPlain}
                onChange={e => setApiForm(f => ({ ...f, apiKeyPlain: e.target.value }))}
                placeholder="输入新的 API Key"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const payload: any = { id: channel.id, baseUrl: apiForm.baseUrl || undefined };
                  if (apiForm.apiKeyPlain) payload.apiKeyPlain = apiForm.apiKeyPlain;
                  updateMutation.mutate(payload, { onSuccess: () => setEditingApi(false) });
                }}
                disabled={updateMutation.isPending}
                className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
              >
                {updateMutation.isPending ? '保存中...' : '保存'}
              </button>
              <button onClick={() => setEditingApi(false)}
                className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 transition">
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 w-24 shrink-0">请求地址</span>
              <span className="font-mono text-gray-700">{channel.baseUrl || '（默认）'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 w-24 shrink-0">API Key</span>
              <span className="text-gray-400">••••••••（已加密存储）</span>
            </div>
          </div>
        )}
      </div>

      {/* 错误信息 */}
      {channel.lastErrorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-6">
          <h3 className="text-sm font-medium text-red-800 mb-1">最近错误</h3>
          <p className="text-xs text-red-600">{channel.lastErrorMessage}</p>
          {channel.lastErrorAt && (
            <p className="text-xs text-red-400 mt-1">{new Date(channel.lastErrorAt).toLocaleString('zh-CN')}</p>
          )}
        </div>
      )}
    </div>
  );
}
