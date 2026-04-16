'use client';

import { trpc } from '@/lib/trpc';

interface ConvertPromptProps {
  convertibleDays: number;
  onClose: () => void;
  onConvert: () => void;
}

export default function ConvertPrompt({ convertibleDays, onClose, onConvert }: ConvertPromptProps) {
  if (convertibleDays <= 0) return null;

  return (
    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-4 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-green-800">
            你有 {convertibleDays} 天 VIP 时长可兑换！
          </p>
          <p className="text-xs text-green-600 mt-0.5">
            每消耗 100 精灵豆可获得 1 天可兑换时长
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-green-700 hover:bg-green-100 rounded-lg transition"
          >
            稍后再说
          </button>
          <button
            onClick={onConvert}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
          >
            立即兑换
          </button>
        </div>
      </div>
    </div>
  );
}
