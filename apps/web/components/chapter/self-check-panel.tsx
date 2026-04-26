'use client';

import { useState } from 'react';

export interface CheckItem {
  id: string;
  type: 'consistency' | 'character' | 'setting' | 'logic' | 'pacing' | 'quality';
  reason: string;
  original: string;
  suggestion: string;
}

interface SelfCheckPanelProps {
  /** 自检报告原始内容（Markdown格式） */
  report: string;
  /** 报告是否正在生成 */
  generating: boolean;
  /** 解析后的检查条目 */
  items: CheckItem[];
  /** 重新自检 */
  onRetry: () => void;
  /** 跳转到修改步骤 */
  onNavigateToModify?: () => void;
}

// 检查项类型中文映射
const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  consistency: { label: '一致性', color: 'bg-blue-100 text-blue-700' },
  character: { label: '人物', color: 'bg-purple-100 text-purple-700' },
  setting: { label: '设定', color: 'bg-green-100 text-green-700' },
  logic: { label: '逻辑', color: 'bg-orange-100 text-orange-700' },
  pacing: { label: '节奏', color: 'bg-pink-100 text-pink-700' },
  quality: { label: '文笔', color: 'bg-indigo-100 text-indigo-700' },
};

export function SelfCheckPanel({
  report, generating, items,
  onRetry, onNavigateToModify,
}: SelfCheckPanelProps) {
  if (generating) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold mb-4">AI 自检报告</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-sm text-gray-500">AI正在自检中，thinking模型时间较久，请耐心等待</span>
          </div>
          <div className="animate-pulse flex items-center gap-3">
            <div className="w-3 h-3 bg-gray-400 rounded-full" />
            <div className="h-4 bg-gray-200 rounded w-3/4" />
          </div>
          <div className="animate-pulse flex items-center gap-3">
            <div className="w-3 h-3 bg-gray-400 rounded-full" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
          <div className="animate-pulse flex items-center gap-3">
            <div className="w-3 h-3 bg-gray-400 rounded-full" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
        {report && (
          <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 rounded-lg p-4 mt-4 border border-gray-100 max-h-64 overflow-y-auto">
            {report}
          </pre>
        )}
      </div>
    );
  }

  if (!report && items.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">AI 自检报告</h2>
        {items.length > 0 && (
          <span className="text-xs text-gray-400">共 {items.length} 条建议</span>
        )}
      </div>

      {/* 结构化检查条目（只读预览） */}
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map(item => {
            const typeInfo = TYPE_LABELS[item.type] || TYPE_LABELS.quality;

            return (
              <div key={item.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeInfo.color}`}>
                    {typeInfo.label}
                  </span>
                </div>

                <div className="px-4 py-3 space-y-2">
                  <div>
                    <p className="text-xs text-gray-400 font-medium">修改原因</p>
                    <p className="text-sm text-gray-700 mt-0.5">{item.reason}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-red-50 rounded p-2">
                      <p className="text-xs text-red-400 font-medium mb-1">原文</p>
                      <p className="text-sm text-red-700">{item.original}</p>
                    </div>
                    <div className="bg-green-50 rounded p-2">
                      <p className="text-sm text-green-700">{item.suggestion}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 rounded-lg p-4 border border-gray-100 max-h-96 overflow-y-auto">
          {report}
        </pre>
      )}

      {/* 操作按钮组 */}
      {!generating && (
        <div className="flex gap-2 mt-4">
          <button onClick={onRetry}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
            重新自检
          </button>
          {onNavigateToModify && report && (
            <button onClick={onNavigateToModify}
              className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition">
              导入自检到修改 →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
