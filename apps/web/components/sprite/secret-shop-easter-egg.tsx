'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

type ShopView = 'items' | 'warehouse';

interface SecretShopEasterEggProps {
  open: boolean;
  onClose: () => void;
}

export default function SecretShopEasterEgg({ open, onClose }: SecretShopEasterEggProps) {
  const [view, setView] = useState<ShopView>('items');

  const { data: items } = trpc.sprite.getItems.useQuery(undefined, { enabled: open });
  const { data: myItems, refetch: refetchMyItems } = trpc.sprite.getMyItems.useQuery(undefined, { enabled: open && view === 'warehouse' });
  const utils = trpc.useUtils();

  const buyMutation = trpc.sprite.buyItem.useMutation();
  const useItemMutation = trpc.sprite.useItem.useMutation();
  const convertMutation = trpc.sprite.convertBeanToDays.useMutation();

  const [buyingItem, setBuyingItem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [xpFlash, setXpFlash] = useState<number | null>(null);

  const showMessage = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 2500);
  };

  const handleBuy = async (itemCode: string) => {
    setBuyingItem(itemCode);
    try {
      const result = await buyMutation.mutateAsync({ itemCode });
      showMessage(`购买成功：${result.itemIcon} ${result.itemName}`);
      utils.sprite.getStatus.invalidate();
      utils.sprite.getMyItems.invalidate();
    } catch (e: any) {
      showMessage(e.message || '购买失败');
    }
    setBuyingItem(null);
  };

  const handleUse = async (itemCode: string) => {
    try {
      const result = await useItemMutation.mutateAsync({ itemCode });
      showMessage(`使用了 ${result.itemName}，+${result.daysAdded}天 · 经验 +${result.xpGained}`);
      // 高亮显示经验值增长
      setXpFlash(result.xpGained);
      setTimeout(() => setXpFlash(null), 1500);
      utils.sprite.getStatus.invalidate();
      refetchMyItems();
    } catch (e: any) {
      showMessage(e.message || '使用失败');
    }
  };

  const handleConvert = async () => {
    try {
      const result = await convertMutation.mutateAsync({});
      showMessage(`兑换成功，+${result.newDays}天`);
      utils.sprite.getStatus.invalidate();
    } catch (e: any) {
      showMessage(e.message || '兑换失败');
    }
  };

  if (!open) return null;

  // 按系别分组商城道具
  const groupedItems: Record<string, NonNullable<typeof items>> = {};
  if (items) {
    for (const item of items) {
      if (!groupedItems[item.species]) groupedItems[item.species] = [];
      groupedItems[item.species]!.push(item);
    }
  }

  const speciesLabels: Record<string, string> = {
    plant: '🌱 植物系',
    animal: '🐾 动物系',
    element: '✨ 元素系',
  };

  // 仓库按系别分组
  const groupedWarehouse: Record<string, NonNullable<typeof myItems>> = {};
  if (myItems) {
    for (const item of myItems) {
      if (item.detail) {
        const species = item.detail.species;
        if (!groupedWarehouse[species]) groupedWarehouse[species] = [];
        groupedWarehouse[species]!.push(item);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl w-[480px] max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏪</span>
            <h2 className="text-lg font-bold text-gray-900">秘密商城</h2>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('items')}
              className={`px-3 py-1.5 text-sm rounded-lg transition ${view === 'items' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              商城
            </button>
            <button onClick={() => setView('warehouse')}
              className={`px-3 py-1.5 text-sm rounded-lg transition ${view === 'warehouse' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              道具仓库
            </button>
          </div>
        </div>

        {/* Toast message */}
        {message && (
          <div className="mx-6 mt-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 text-center">
            {message}
          </div>
        )}

        {/* XP flash overlay */}
        {xpFlash !== null && (
          <div className="mx-6 mt-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <p className="text-sm text-blue-600 font-medium">精灵经验 +{xpFlash}</p>
            <p className="text-xs text-blue-400 mt-0.5">经验值随道具消耗同步增长</p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {view === 'items' && (
            <div className="space-y-6">
              {Object.entries(groupedItems).map(([species, speciesItems]) => (
                <div key={species}>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">{speciesLabels[species] || species}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {speciesItems!.map(item => (
                      <div key={item.code} className="border border-gray-100 rounded-xl p-3 hover:border-gray-200 transition">
                        <div className="text-2xl mb-2">{item.icon}</div>
                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-0.5">经验 +{item.price}</p>
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-sm font-semibold text-amber-600">{item.price} 🫘</span>
                          <button onClick={() => handleBuy(item.code)}
                            disabled={buyingItem === item.code}
                            className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-800 transition disabled:opacity-50">
                            {buyingItem === item.code ? '购买中...' : '购买'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(!items || items.length === 0) && (
                <p className="text-center text-gray-400 py-8">暂无商品</p>
              )}
            </div>
          )}

          {view === 'warehouse' && (
            <div className="space-y-6">
              {Object.entries(groupedWarehouse).map(([species, warehouseItems]) => (
                <div key={species}>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">{speciesLabels[species] || species}</h3>
                  <div className="space-y-2">
                    {warehouseItems!.sort((a, b) => (b.quantity ?? 0) - (a.quantity ?? 0)).map(item => (
                      <div key={item.itemCode} className="border border-gray-100 rounded-xl p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{item.detail?.icon}</span>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{item.detail?.name || item.itemCode}</p>
                            <p className="text-xs text-gray-500">持有 ×{item.quantity} · 经验 +{item.detail?.price ?? 0}</p>
                          </div>
                        </div>
                        <button onClick={() => handleUse(item.itemCode)}
                            className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition">
                            使用
                          </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(!myItems || myItems.length === 0 || myItems.every(i => (i.quantity ?? 0) <= 0)) && (
                <p className="text-center text-gray-400 py-8">仓库空空如也~</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose}
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
