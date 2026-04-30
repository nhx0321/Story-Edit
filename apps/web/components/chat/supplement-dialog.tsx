'use client';

import type { StepConfig } from './guided-flow';

interface SupplementDialogProps {
  step: StepConfig;
  onSupplement: () => void;
  onSkip: () => void;
}

export function SupplementDialog({ step, onSupplement, onSkip }: SupplementDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
      <div
        className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold mb-2">
          「{step.label}」已完成
        </h3>
        <p className="text-sm text-gray-500 mb-5">是否要补充或修改该部分内容？</p>
        <div className="flex gap-3">
          <button
            onClick={onSkip}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            跳过
          </button>
          <button
            onClick={onSupplement}
            className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition"
          >
            补充
          </button>
        </div>
      </div>
    </div>
  );
}
