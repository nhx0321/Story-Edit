'use client';

import { useState } from 'react';

interface ActionCardProps {
  actionType: string;
  payload: Record<string, unknown>;
  onConfirm: (actionType: string, payload: Record<string, unknown>) => Promise<void>;
  confirmed?: boolean;
}

const ACTION_LABELS: Record<string, string> = {
  create_volume: '创建卷',
  create_unit: '创建单元',
  create_chapter: '创建章节',
  create_setting: '创建设定',
  save_version: '保存版本',
  archive_version: '归档版本',
};

const ACTION_HINTS: Record<string, string> = {
  create_chapter: '创建的是章节大纲（标题+梗概），点击章节进入编辑器，使用"AI 创作"可生成正文',
};

export function ActionCard({ actionType, payload, onConfirm, confirmed }: ActionCardProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(confirmed ?? false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm(actionType, payload);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  };

  const label = ACTION_LABELS[actionType] || actionType;
  const title = (payload.title as string) || (payload.label as string) || '';

  return (
    <div className={`my-2 rounded-lg border p-3 text-sm ${done ? 'border-green-300 bg-green-50' : error ? 'border-red-300 bg-red-50' : 'border-blue-300 bg-blue-50'}`}>
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium">{label}</span>
          {title && <span className="ml-2 text-gray-600">— {title}</span>}
        </div>
        {done ? (
          <span className="text-xs text-green-600 font-medium">已创建</span>
        ) : error ? (
          <button onClick={handleConfirm} disabled={loading}
            className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50">
            {loading ? '重试中...' : '重试'}
          </button>
        ) : (
          <button onClick={handleConfirm} disabled={loading}
            className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? '执行中...' : '确认'}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600 whitespace-pre-wrap">{error}</p>}
      {!done && !error && ACTION_HINTS[actionType] && (
        <p className="mt-2 text-xs text-gray-500">{ACTION_HINTS[actionType]}</p>
      )}
    </div>
  );
}
