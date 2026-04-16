'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

export default function InventoryPage() {
  const { data: myItems, isLoading } = trpc.sprite.getMyItems.useQuery();
  const utils = trpc.useUtils();
  const useItemMutation = trpc.sprite.useItem.useMutation();
  const [message, setMessage] = useState<string | null>(null);
  const [usingItem, setUsingItem] = useState<string | null>(null);
  const [xpFlash, setXpFlash] = useState<number | null>(null);

  const showMessage = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 2500);
  };

  const handleUse = async (itemCode: string) => {
    setUsingItem(itemCode);
    try {
      const result = await useItemMutation.mutateAsync({ itemCode });
      showMessage(`使用了 ${result.itemName}，+${result.daysAdded}天`);
      setXpFlash(result.xpGained);
      setTimeout(() => setXpFlash(null), 1500);
      utils.sprite.getStatus.invalidate();
      utils.sprite.getMyItems.invalidate();
    } catch (e: any) {
      showMessage(e.message || '使用失败');
    }
    setUsingItem(null);
  };

  const ownedItems = myItems?.filter(i => (i.quantity ?? 0) > 0) || [];

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/sprite-shop" className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回精灵商城</Link>
        <h1 className="text-2xl font-bold mt-4 mb-2">道具仓库</h1>
        <p className="text-gray-500 mb-6">已购买的道具，使用后立即生效</p>

        {/* Toast */}
        {message && (
          <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 text-center">
            {message}
          </div>
        )}

        {/* XP flash overlay */}
        {xpFlash !== null && (
          <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <p className="text-sm text-blue-600 font-medium">精灵经验 +{xpFlash}</p>
            <p className="text-xs text-blue-400 mt-0.5">经验值随道具消耗同步增长</p>
          </div>
        )}

        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400">加载中...</p>
          </div>
        ) : ownedItems.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-4xl mb-4">📦</p>
            <p className="text-gray-400 mb-4">仓库空空如也~</p>
            <Link href="/sprite-shop"
              className="inline-block px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
              前往商城
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {ownedItems.map(item => (
                <div key={item.itemCode} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{item.detail?.icon}</span>
                    <div>
                      <p className="font-medium text-gray-900">{item.detail?.name || item.itemCode}</p>
                      <p className="text-sm text-gray-500">{item.detail?.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        持有 ×{item.quantity} · 经验 +{item.detail?.price ?? 0}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleUse(item.itemCode)}
                    disabled={useItemMutation.isPending || usingItem === item.itemCode}
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                  >
                    {usingItem === item.itemCode ? '使用中...' : '使用'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 快捷链接 */}
        <div className="mt-6 flex gap-3">
          <Link href="/sprite-shop"
            className="flex-1 text-center px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            精灵商城
          </Link>
        </div>
      </div>
    </main>
  );
}
