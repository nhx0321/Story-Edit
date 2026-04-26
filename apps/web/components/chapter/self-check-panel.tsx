'use client';

import { useState, useCallback } from 'react';

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
  /** 应用修改回调（传入建议文本） */
  onApplySuggestion: (suggestion: string) => void;
  /** 全部应用 */
  onApplyAll: (suggestions: string[]) => void;
  /** 重新自检 */
  onRetry: () => void;
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
  onApplySuggestion, onApplyAll, onRetry,
}: SelfCheckPanelProps) {
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);

  const handleApply = useCallback((item: CheckItem) => {
    onApplySuggestion(item.suggestion);
    setAppliedIds(prev => new Set(prev).add(item.id));
    setHighlightedId(item.id);
    setTimeout(() => setHighlightedId(null), 2000);
  }, [onApplySuggestion]);

  const handleApplyAll = useCallback(() => {
    setApplyingAll(true);
    const suggestions = items
      .filter(item => !appliedIds.has(item.id))
      .map(item => item.suggestion);
    onApplyAll(suggestions);
    setAppliedIds(new Set(items.map(item => item.id)));
    setApplyingAll(false);
  }, [items, appliedIds, onApplyAll]);

  if (generating) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold mb-4">AI 自检报告</h2>
        <div className="space-y-3">
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
        {/* Show partial report if available */}
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">共 {items.length} 条建议</span>
            <button onClick={handleApplyAll}
              disabled={applyingAll || appliedIds.size === items.length}
              className="px-3 py-1 text-xs bg-gray-900 text-white rounded-md hover:bg-gray-800 transition disabled:opacity-50">
              {applyingAll ? '应用中...' : appliedIds.size === items.length ? '已全部应用' : '一键全部应用'}
            </button>
          </div>
        )}
      </div>

      {/* 结构化检查条目 */}
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map(item => {
            const isApplied = appliedIds.has(item.id);
            const isHighlighted = highlightedId === item.id;
            const typeInfo = TYPE_LABELS[item.type] || TYPE_LABELS.quality;

            return (
              <div
                key={item.id}
                className={`border rounded-lg overflow-hidden transition-all duration-300 ${
                  isHighlighted
                    ? 'border-green-400 shadow-md shadow-green-100'
                    : isApplied
                    ? 'border-green-200 bg-green-50/30'
                    : 'border-gray-200'
                }`}
              >
                {/* 头部：类型 + 状态 */}
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                    {isApplied && (
                      <span className="text-xs text-green-600 font-medium">✓ 已应用</span>
                    )}
                  </div>
                  {!isApplied && (
                    <button onClick={() => handleApply(item)}
                      className="text-xs px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 transition font-medium">
                      应用修改
                    </button>
                  )}
                </div>

                {/* 内容 */}
                <div className="px-4 py-3 space-y-2">
                  <div>
                    <p className="text-xs text-gray-400 font-medium">修改原因</p>
                    <p className="text-sm text-gray-700 mt-0.5">{item.reason}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-red-50 rounded p-2">
                      <p className="text-xs text-red-400 font-medium mb-1">原文</p>
                      <p className="text-sm text-red-700 line-clamp-3">{item.original}</p>
                    </div>
                    <div className="bg-green-50 rounded p-2">
                      <p className="text-xs text-green-400 font-medium mb-1">修改后</p>
                      <p className="text-sm text-green-700 line-clamp-3">{item.suggestion}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 纯文本报告 */
        <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 rounded-lg p-4 border border-gray-100 max-h-96 overflow-y-auto">
          {report}
        </pre>
      )}

      {/* 重新自检 */}
      {!generating && (
        <button onClick={onRetry}
          className="w-full mt-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
          重新自检
        </button>
      )}
    </div>
  );
}
