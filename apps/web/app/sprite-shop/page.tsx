'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

export default function SpriteShopPage() {
  const { data: items } = trpc.sprite.getItems.useQuery();
  const { data: status } = trpc.sprite.getStatus.useQuery();
  const utils = trpc.useUtils();
  const buyMutation = trpc.sprite.buyItem.useMutation();
  const [message, setMessage] = useState<string | null>(null);

  const s = status as any;
  const beanBalance = s?.beanBalance ?? 0;
  const totalXp = s?.totalXp ?? s?.totalBeanSpent ?? 0;
  const convertibleDays = s?.convertibleDays ?? 0;

  const showMessage = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 2500);
  };

  const handleBuy = async (itemCode: string) => {
    try {
      const result = await buyMutation.mutateAsync({ itemCode });
      showMessage(`购买成功：${result.itemIcon} ${result.itemName}`);
      utils.sprite.getStatus.invalidate();
    } catch (e: any) {
      showMessage(e.message || '购买失败');
    }
  };

  if (!s?.hasSprite || !s?.isHatched) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 mb-4">精灵尚未孵化，完成新手引导后即可使用商城</p>
            <Link href="/dashboard" className="inline-block px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
              前往工作台
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回工作台</Link>
        <h1 className="text-2xl font-bold mt-4 mb-2">精灵商城</h1>
        <p className="text-gray-500 mb-6">购买道具，加速精灵成长</p>

        {/* 状态栏 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-4">
            <p className="text-xs text-green-600 mb-1">精灵豆余额</p>
            <p className="text-2xl font-bold text-green-800">{beanBalance}</p>
          </div>
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4">
            <p className="text-xs text-blue-600 mb-1">精灵经验</p>
            <p className="text-2xl font-bold text-blue-800">{totalXp}</p>
          </div>
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-200 p-4">
            <p className="text-xs text-purple-600 mb-1">可兑换 VIP</p>
            <p className="text-2xl font-bold text-purple-800">{convertibleDays} 天</p>
          </div>
        </div>

        {/* Toast */}
        {message && (
          <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 text-center">
            {message}
          </div>
        )}

        {/* 道具列表 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold">全部道具</h2>
            <p className="text-xs text-gray-400 mt-0.5">所有道具不可退款</p>
          </div>

          <div className="divide-y divide-gray-100">
            {items?.map(item => (
              <div key={item.code} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{item.icon}</span>
                  <div>
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-500">{item.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      加速 {Math.max(1, Math.ceil(item.effectMinutes / 1440))} 天 · 经验 +{item.price}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-lg font-semibold text-amber-600">{item.price} 🫘</p>
                    <p className="text-xs text-gray-400">{(item.price / 100).toFixed(2)} 元</p>
                  </div>
                  <button
                    onClick={() => handleBuy(item.code)}
                    disabled={buyMutation.isPending || beanBalance < item.price}
                    className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {beanBalance < item.price ? '余额不足' : '购买'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 快捷链接 */}
        <div className="mt-6 flex gap-3">
          <Link href="/sprite-shop/inventory"
            className="flex-1 text-center px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            道具仓库
          </Link>
        </div>
      </div>
    </main>
  );
}
