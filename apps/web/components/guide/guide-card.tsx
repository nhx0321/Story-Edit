'use client';

import { useMemo } from 'react';

interface GuideCardProps {
  title: string;
  text: string;
  step: number;
  totalSteps: number;
  placement: 'top' | 'bottom' | 'left' | 'right';
  targetRect: DOMRect | null;
  showNext: boolean;
  showSkip: boolean;
  onNext: () => void;
  onSkip: () => void;
  onLater: () => void;
  targetFound: boolean;
}

const CARD_WIDTH = 320;
const CARD_PADDING = 16;
const GAP = 12;

export default function GuideCard({
  title, text, step, totalSteps, placement, targetRect,
  showNext, showSkip, onNext, onSkip, onLater, targetFound,
}: GuideCardProps) {
  const style = useMemo(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

    if (!targetRect) {
      // No target - center on screen
      return {
        left: Math.max(20, (vw - CARD_WIDTH) / 2),
        top: Math.max(20, (vh - 200) / 2),
        maxWidth: Math.min(CARD_WIDTH, vw - 40),
      };
    }

    let left = 0, top = 0;

    switch (placement) {
      case 'bottom':
        left = targetRect.left + targetRect.width / 2 - CARD_WIDTH / 2;
        top = targetRect.bottom + GAP;
        break;
      case 'top':
        left = targetRect.left + targetRect.width / 2 - CARD_WIDTH / 2;
        top = targetRect.top - GAP - 200;
        break;
      case 'left':
        left = targetRect.left - GAP - CARD_WIDTH;
        top = targetRect.top + targetRect.height / 2 - 100;
        break;
      case 'right':
        left = targetRect.right + GAP;
        top = targetRect.top + targetRect.height / 2 - 100;
        break;
    }

    // Clamp to viewport
    left = Math.max(CARD_PADDING, Math.min(left, vw - CARD_WIDTH - CARD_PADDING));
    top = Math.max(CARD_PADDING, Math.min(top, vh - 220));

    return { left, top, maxWidth: Math.min(CARD_WIDTH, vw - 40) };
  }, [targetRect, placement]);

  return (
    <div
      className="bg-white rounded-2xl shadow-2xl border border-gray-100"
      style={{
        position: 'absolute',
        left: style.left,
        top: style.top,
        maxWidth: style.maxWidth,
        width: CARD_WIDTH,
      }}
    >
      {/* Progress bar */}
      <div className="flex gap-1 px-5 pt-4">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition ${i <= step ? 'bg-emerald-500' : 'bg-gray-200'}`}
          />
        ))}
      </div>

      <div className="p-5">
        {/* Step label */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🥚</span>
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
        </div>

        {/* Text */}
        <p className="text-sm text-gray-600 mb-5 whitespace-pre-line leading-relaxed">{text}</p>

        {!targetFound && (
          <p className="text-xs text-amber-600 mb-3">
            目标元素未出现，请继续操作~
          </p>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          {showSkip && (
            <button
              onClick={onSkip}
              className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition"
            >
              跳过
            </button>
          )}
          <button
            onClick={onLater}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            稍后再说
          </button>
          {showNext && (
            <button
              onClick={onNext}
              className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition"
            >
              {step === 9 ? '开始孵化' : '下一步'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
