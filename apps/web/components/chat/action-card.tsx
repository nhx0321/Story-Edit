'use client';

import { useState } from 'react';

interface ActionCardProps {
  actionType: string;
  payload: Record<string, unknown>;
  onConfirm: (actionType: string, payload: Record<string, unknown>) => Promise<void>;
  onSupplement?: (actionType: string, payload: Record<string, unknown>) => void;
  confirmed?: boolean;
}

const ACTION_LABELS: Record<string, string> = {
  create_volume: '创建卷',
  create_unit: '创建单元',
  create_chapter: '创建章节',
  create_setting: '创建设定',
  create_narrative: '创建故事脉络',
  update_volume: '覆盖卷',
  update_unit: '覆盖单元',
  update_chapter: '覆盖章节',
  update_setting: '覆盖设定',
  update_narrative: '更新故事脉络',
  save_version: '保存版本',
  archive_version: '归档版本',
  deliver_settings: '交付设定清单',
};

const ACTION_HINTS: Record<string, string> = {
  create_chapter: '创建的是章节大纲（标题+梗概），点击章节进入编辑器，使用"AI 创作"可生成正文',
  update_volume: '确认后将覆盖原有卷内容，无法撤销',
  update_unit: '确认后将覆盖原有单元内容，无法撤销',
  update_chapter: '确认后将覆盖原有章节梗概，无法撤销',
  update_setting: '确认后将覆盖原有设定内容，无法撤销',
  update_narrative: '确认后将覆盖原有故事脉络，无法撤销',
  deliver_settings: '设定编辑已完成全部设定，文学编辑可接收此清单用于梗概优化',
};

const CREATE_TYPES = ['create_volume', 'create_unit', 'create_chapter', 'create_setting', 'create_narrative'];

function getSupplementPrompt(actionType: string, payload: Record<string, unknown>): string {
  const title = (payload.title as string) || (payload.label as string) || '该条目';
  return `我想补充一下关于「${title}」的内容...`;
}

function getConfirmLabel(actionType: string): string {
  if (actionType === 'deliver_settings') return '接收设定清单';
  return '确认';
}

export function ActionCard({ actionType, payload, onConfirm, onSupplement, confirmed }: ActionCardProps) {
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

  const handleSupplement = () => {
    const prompt = getSupplementPrompt(actionType, payload);
    onSupplement?.(actionType, { ...payload, supplementPrompt: prompt });
  };

  const label = ACTION_LABELS[actionType] || actionType;
  const title = (payload.title as string) || (payload.label as string) || '';
  const summary = (payload.summary as string) || '';
  const isCreateType = CREATE_TYPES.includes(actionType);

  // deliver_settings / narrative 的内容渲染
  const renderContent = () => {
    if (actionType === 'deliver_settings' && summary) {
      return (
        <div className="mt-2 p-2 bg-white/60 rounded text-xs text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
          {summary}
        </div>
      );
    }
    if ((actionType === 'create_narrative' || actionType === 'update_narrative') && summary) {
      return (
        <div className="mt-2 p-2 bg-white/60 rounded text-xs text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto">
          {summary}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`my-2 rounded-lg border p-3 text-sm ${done ? 'border-green-300 bg-green-50' : error ? 'border-red-300 bg-red-50' : 'border-blue-300 bg-blue-50'}`}>
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium">{label}</span>
          {title && <span className="ml-2 text-gray-600">— {title}</span>}
        </div>
        {done ? (
          <span className="text-xs text-green-600 font-medium">已确认</span>
        ) : error ? (
          <button onClick={handleConfirm} disabled={loading}
            className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50">
            {loading ? '重试中...' : '重试'}
          </button>
        ) : isCreateType ? (
          <div className="flex gap-2">
            {onSupplement && (
              <button onClick={handleSupplement}
                className="px-3 py-1 border border-gray-300 text-gray-600 rounded text-xs font-medium hover:bg-gray-100">
                补充
              </button>
            )}
            <button onClick={handleConfirm} disabled={loading}
              className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
              {loading ? '执行中...' : '确认'}
            </button>
          </div>
        ) : (
          <button onClick={handleConfirm} disabled={loading}
            className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? '执行中...' : getConfirmLabel(actionType)}
          </button>
        )}
      </div>
      {renderContent()}
      {error && <p className="mt-2 text-xs text-red-600 whitespace-pre-wrap">{error}</p>}
      {!done && !error && ACTION_HINTS[actionType] && (
        <p className="mt-2 text-xs text-gray-500">{ACTION_HINTS[actionType]}</p>
      )}
    </div>
  );
}
