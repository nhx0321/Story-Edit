'use client';

import { CUMULATIVE_XP } from '@/lib/sprite-config';

interface ContextMenuProps {
  open: boolean;
  onClose: () => void;
  position: { x: number; y: number };
  level: number;
  beanBalance: number;
  totalXp: number;
  totalBeanSpent: number;
  convertibleDays: number;
  fatigueLevel?: number;
  dailyFeedbackTriggered?: boolean;
  onSecretShop: () => void;
  onMyItems: () => void;
  onConvert: () => void;
  onChat: () => void;
  onShareToSprite?: () => void;
  onTestLevelUp?: () => void;
}

export default function ContextMenu({
  open, onClose, position, level, beanBalance,
  totalXp, totalBeanSpent, convertibleDays,
  fatigueLevel = 0, dailyFeedbackTriggered = false,
  onSecretShop, onMyItems, onConvert, onChat, onShareToSprite, onTestLevelUp,
}: ContextMenuProps) {
  if (!open) return null;

  // XP progress
  const cumulativeTarget = CUMULATIVE_XP[level + 1] ?? CUMULATIVE_XP[9];
  const xpPercent = level >= 9 ? 100 : Math.min(100, Math.round((totalXp / cumulativeTarget) * 100));
  const xpNeeded = level >= 9 ? 0 : Math.max(0, cumulativeTarget - totalXp);

  // VIP countdown: beans needed for next VIP day
  const beansForNextVip = 100 - (totalBeanSpent % 100);
  const hasConvertibleVip = convertibleDays > 0;

  // Position menu to stay on screen
  const menuX = Math.min(position.x, typeof window !== 'undefined' ? window.innerWidth - 220 : 300);
  const menuY = Math.min(position.y, typeof window !== 'undefined' ? window.innerHeight - 150 : 200);

  // 疲劳状态
  const isSleeping = fatigueLevel >= 100;
  const isTired = fatigueLevel >= 60 && fatigueLevel < 100;
  const fatigueText = isSleeping ? '精灵在睡觉' : isTired ? '精灵有点累了' : '精灵精力充沛';
  const fatigueEmoji = isSleeping ? '💤' : isTired ? '😴' : '✨';

  return (
    <>
      <div className="fixed inset-0 z-[55]" onClick={onClose} />
      <div className="fixed z-[56] bg-white rounded-xl border border-gray-200 shadow-xl w-56 py-2"
        style={{ left: menuX, top: menuY }}>
        <div className="px-4 py-2 border-b border-gray-100">
          <p className="text-xs text-gray-500">当前等级</p>
          <p className="text-lg font-bold">Lv.{level}</p>
        </div>

        {level < 9 && (
          <div className="px-4 py-2 border-b border-gray-100">
            {/* 经验值进度 */}
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>升级经验</span>
              <span>{totalXp}/{cumulativeTarget}</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${xpPercent}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">还需 {xpNeeded} 经验</p>
          </div>
        )}

        {level >= 9 && (
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-xs text-amber-600 font-medium">已满级</p>
          </div>
        )}

        {/* 精灵豆余额 */}
        <div className="px-4 py-2 border-b border-gray-100">
          <p className="text-xs text-gray-500">精灵豆</p>
          <p className="text-sm font-medium text-amber-600">{beanBalance} 🫘</p>
        </div>

        {/* 已使用精灵豆 & VIP 兑换提示 */}
        <div className="px-4 py-2 border-b border-gray-100">
          <p className="text-xs text-gray-500">已使用精灵豆</p>
          <p className="text-sm font-medium text-green-700">{totalBeanSpent} 🫘</p>
          {hasConvertibleVip ? (
            <p className="text-xs text-green-600 mt-0.5">
              可兑换 {convertibleDays} 天 VIP <button onClick={onConvert} className="underline hover:text-green-800">立即兑换</button>
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5">
              再消耗 {beansForNextVip} 豆可兑换 1 天 VIP
            </p>
          )}
        </div>

        {/* 精灵精力状态 */}
        <div className="px-4 py-2 border-b border-gray-100">
          <p className="text-xs text-gray-500">精灵状态</p>
          <p className="text-sm font-medium">{fatigueEmoji} {fatigueText}</p>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
            <div className={`h-full rounded-full transition-all ${isSleeping ? 'bg-red-400' : isTired ? 'bg-yellow-400' : 'bg-green-400'}`}
              style={{ width: `${Math.min(100, fatigueLevel)}%` }} />
          </div>
        </div>

        <button onClick={onChat}
          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
          和精灵聊天
        </button>

        {onShareToSprite && (
          <button onClick={onShareToSprite}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
            分享给精灵
          </button>
        )}

        <button onClick={onSecretShop}
          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
          秘密商城
        </button>

        <button onClick={onMyItems}
          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
          道具仓库
        </button>

        {onTestLevelUp && level < 9 && (
          <button onClick={onTestLevelUp}
            className="w-full text-left px-4 py-2.5 text-sm text-purple-600 hover:bg-purple-50 transition">
            升级测试 ✨
          </button>
        )}

        <div className="border-t border-gray-100 mt-1 pt-1">
          <button onClick={onClose}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-50 transition">
            关闭
          </button>
        </div>
      </div>
    </>
  );
}
