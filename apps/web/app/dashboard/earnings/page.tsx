'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';

export default function EarningsPage() {
  const utils = trpc.useUtils();

  const { data: earnings } = trpc.template.getEarnings.useQuery();

  const totalEarned = earnings?.totalEarnings ?? 0;
  const totalSales = earnings?.templateEarnings.reduce((sum, t) => sum + t.salesCount, 0) ?? 0;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回工作台</Link>
        <div className="mt-4 mb-6">
          <h1 className="text-2xl font-bold">模板收益</h1>
          <p className="text-sm text-gray-500 mt-1">查看模板销售收益</p>
        </div>

        {/* 收益概览 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-400 mb-1">累计收益</p>
            <p className="text-2xl font-bold">¥{(totalEarned / 100).toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-400 mb-1">总销量</p>
            <p className="text-2xl font-bold">{totalSales}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-400 mb-1">模板数</p>
            <p className="text-2xl font-bold">{earnings?.templateEarnings.length ?? 0}</p>
          </div>
        </div>

        {/* 模板收益明细 */}
        <div className="bg-white rounded-xl border border-gray-200 mb-6">
          <h3 className="text-sm font-medium px-5 py-3 border-b border-gray-100">模板收益明细</h3>
          {earnings?.templateEarnings.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">暂无收益</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {earnings?.templateEarnings.map(t => (
                <div key={t.templateId} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-gray-400">单价 ¥{(t.price ?? 0) / 100}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">¥{t.totalAmount / 100}</p>
                    <p className="text-xs text-gray-400">{t.salesCount} 笔</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
