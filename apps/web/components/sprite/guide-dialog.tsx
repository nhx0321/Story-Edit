'use client';

import { GUIDE_TEXTS } from '@/lib/sprite-config';

interface GuideDialogProps {
  open: boolean;
  step: number;
  customName: string | null | undefined;
  onNext: () => void;
  onSkip: () => void;
  onLater: () => void;
}

export default function GuideDialog({ open, step, customName, onNext, onSkip, onLater }: GuideDialogProps) {
  if (!open || step <= 0 || step > 4) return null;

  const guideStep = step <= 3 ? step : 4;
  const current = GUIDE_TEXTS[guideStep];
  if (!current) return null;

  const text = current.text.replace('{name}', customName || '小精灵');

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/20" onClick={onLater}>
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">✨</span>
          <h3 className="text-base font-bold">{current.title}</h3>
        </div>
        <p className="text-sm text-gray-600 mb-6">{text}</p>
        <div className="flex gap-2">
          <button onClick={onSkip}
            className="flex-1 py-2 text-sm text-gray-400 hover:text-gray-600 transition">
            略过
          </button>
          <button onClick={onLater}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
            下次再说
          </button>
          {current.showNext && (
            <button onClick={onNext}
              className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
              下一步
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
