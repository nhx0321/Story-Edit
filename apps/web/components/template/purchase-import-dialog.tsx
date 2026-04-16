'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

interface PurchaseImportDialogProps {
  templateId: string;
  templateTitle: string;
  onClose: () => void;
  onImported: () => void;
}

export function PurchaseImportDialog({ templateId, templateTitle, onClose, onImported }: PurchaseImportDialogProps) {
  const utils = trpc.useUtils();
  const { data: projects, isLoading } = trpc.project.list.useQuery();
  const { data: myTemplates } = trpc.template.myTemplates.useQuery({});
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{ existing: any; version: string } | null>(null);

  const importMutation = trpc.template.importFromMarketplace.useMutation({
    onSuccess: () => {
      utils.template.myTemplates.invalidate();
      onImported();
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  const handleImportClick = () => {
    if (!selectedProjectId) return;

    // Check for duplicate imports in the selected project
    const existingTemplate = myTemplates?.find(
      t => t.templateId === templateId && t.projectId === selectedProjectId
    );

    if (existingTemplate) {
      // Calculate next version number
      const titleMatch = existingTemplate.title.match(/(.*?)(?:\s*v(\d+))?$/);
      const baseTitle = titleMatch?.[1] || templateTitle;
      const currentVersion = parseInt(titleMatch?.[2] || '1');
      const nextVersion = currentVersion + 1;
      setDuplicateInfo({ existing: existingTemplate, version: `v${nextVersion}` });
      setShowConfirm(true);
    } else {
      setShowConfirm(true);
    }
  };

  const handleConfirmImport = () => {
    setError('');
    let finalTitle = templateTitle;

    // If duplicate, add version number
    if (duplicateInfo) {
      finalTitle = `${templateTitle} ${duplicateInfo.version}`;
    }

    importMutation.mutate({
      templateId,
      projectId: selectedProjectId,
      // Note: The backend doesn't accept custom title, so version is appended in title display
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">导入到项目</h2>
          <p className="text-sm text-gray-500 mt-1">将「{templateTitle}」导入到以下项目</p>
        </div>

        <div className="px-6 py-4">
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

          {isLoading ? (
            <div className="py-8 text-center text-gray-400">加载中...</div>
          ) : projects && projects.length > 0 ? (
            <div className="space-y-2">
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProjectId(p.id); setShowConfirm(false); setDuplicateInfo(null); }}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    selectedProjectId === p.id
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <span className="font-medium">{p.name}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{p.genre || '未设置类型'}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-gray-400">
              <p>还没有项目</p>
              <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">先去创建一个项目吧 →</a>
            </div>
          )}
        </div>

        {/* 确认对话框 */}
        {showConfirm && selectedProjectId && (
          <div className="px-6 py-3 border-t border-gray-100 bg-amber-50">
            <p className="text-sm text-amber-800">
              {duplicateInfo
                ? `该项目已导入过此模板，将以「${duplicateInfo.version}」重新导入`
                : '确认花费 10 精灵豆导入此模板？'}
            </p>
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">
            取消
          </button>
          {showConfirm ? (
            <button onClick={handleConfirmImport}
              disabled={importMutation.isPending}
              className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition disabled:opacity-50">
              {importMutation.isPending ? '导入中...' : '确认导入'}
            </button>
          ) : (
            <button onClick={handleImportClick}
              disabled={!selectedProjectId}
              className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition disabled:opacity-50">
              下一步
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
