'use client';

import { trpc } from '@/lib/trpc';

interface ShopItemProps {
  item: {
    code: string;
    name: string;
    icon: string | null;
    price: number | null;
    effectMinutes: number | null;
    description: string | null;
  };
  onBuy: (itemCode: string) => void;
  isPending: boolean;
  canAfford: boolean;
}

export default function ShopItem({ item, onBuy, isPending, canAfford }: ShopItemProps) {
  const days = item.effectMinutes ? Math.max(1, Math.ceil(item.effectMinutes / 1440)) : 0;
  const xp = item.price ?? 0;

  return (
    <div className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition bg-white">
      <div className="flex items-start gap-3">
        <span className="text-3xl">{item.icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900">{item.name}</h3>
          {item.description && (
            <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            {days > 0 && <span>加速 {days} 天</span>}
            <span>经验 +{xp}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-50">
        <div>
          <span className="text-lg font-semibold text-amber-600">{item.price} 🫘</span>
          <span className="text-xs text-gray-400 ml-1">({((item.price ?? 0) / 100).toFixed(2)} 元)</span>
        </div>
        <button
          onClick={() => onBuy(item.code)}
          disabled={isPending || !canAfford}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {!canAfford ? '余额不足' : isPending ? '购买中...' : '购买'}
        </button>
      </div>
    </div>
  );
}
