'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

interface ExperienceTemplateImportProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onImported: () => void;
}

export function ExperienceTemplateImport({ open, onClose, projectId, onImported }: ExperienceTemplateImportProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customContent, setCustomContent] = useState('');
  const [customLevel, setCustomLevel] = useState<'L0' | 'L1' | 'L2' | 'L3' | 'L4'>('L2');
  const [customCategory, setCustomCategory] = useState('');

  const { data: myTemplates } = trpc.template.myTemplates.useQuery(
    { projectId },
    { enabled: open },
  );

  // 过滤只显示创作经验类模板
  const experienceTemplates = myTemplates?.filter(t =>
    t.category === 'experience' ||
    t.title.includes('创作经验') ||
    t.title.match(/\[L[0-3]\]/)
  );

  const importTemplate = trpc.template.importTemplate.useMutation({
    onSuccess: () => { onImported(); onClose(); },
  });

  const createMemory = trpc.workflow.createMemory.useMutation({
    onSuccess: () => { onImported(); onClose(); },
  });

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleImportSelected = () => {
    if (selectedIds.size === 0) return;
    // Import each selected template as a memory entry
    const ids = Array.from(selectedIds);
    const importNext = async (index: number) => {
      if (index >= ids.length) {
        setSelectedIds(new Set());
        return;
      }
      const template = experienceTemplates?.find(t => t.id === ids[index]);
      if (template) {
        // Parse template content to extract level/category if possible
        let level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4' = 'L2';
        let category = template.title;
        const levelMatch = template.title.match(/\[L[0-4]\]/);
        if (levelMatch) {
          level = levelMatch[0].slice(1, 3) as 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
          category = template.title.replace(/\[L[0-4]\]\s*/, '');
        }
        createMemory.mutate({
          projectId,
          level,
          category,
          content: template.content,
        });
      }
      importNext(index + 1);
    };
    importNext(0);
  };

  const handleCreateCustom = () => {
    if (!customContent.trim() || !customTitle.trim()) return;
    createMemory.mutate({
      projectId,
      level: customLevel,
      category: customCategory || customTitle,
      content: customContent,
    });
    setShowCustomForm(false);
    setCustomTitle('');
    setCustomContent('');
    setCustomCategory('');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full mx-4 shadow-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-sm">从模板导入经验</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {showCustomForm ? (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">新建经验模板</h4>
              <div className="flex gap-2">
                <select
                  value={customLevel}
                  onChange={e => setCustomLevel(e.target.value as 'L0' | 'L1' | 'L2' | 'L3' | 'L4')}
                  className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1"
                >
                  {['L0', 'L1', 'L2', 'L3', 'L4'].map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={customCategory}
                  onChange={e => setCustomCategory(e.target.value)}
                  placeholder="分类"
                  className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1"
                />
              </div>
              <input
                type="text"
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                placeholder="标题"
                className="w-full text-sm bg-gray-50 border border-gray-200 rounded px-3 py-2"
              />
              <textarea
                value={customContent}
                onChange={e => setCustomContent(e.target.value)}
                placeholder="经验内容..."
                className="w-full h-32 p-3 text-xs bg-gray-50 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateCustom}
                  disabled={createMemory.isLoading || !customContent.trim() || !customTitle.trim()}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                >
                  创建
                </button>
                <button
                  onClick={() => setShowCustomForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  取消
                </button>
              </div>
            </div>
          ) : experienceTemplates && experienceTemplates.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 mb-3">勾选需要导入的创作经验模板</p>
              {experienceTemplates.map(t => (
                <label
                  key={t.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    selectedIds.has(t.id)
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(t.id)}
                    onChange={() => handleToggleSelect(t.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="text-xs text-gray-400 mt-1 truncate">{t.content.slice(0, 100)}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {t.source === 'custom' ? '自定义' : '导入'} · {new Date(t.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400 mb-3">暂无创作经验模板</p>
              <p className="text-xs text-gray-400">可先通过经验面板导出到模板库</p>
            </div>
          )}
        </div>

        {!showCustomForm && (
          <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
            <button
              onClick={() => setShowCustomForm(true)}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              新建模板
            </button>
            {selectedIds.size > 0 && (
              <button
                onClick={handleImportSelected}
                disabled={importTemplate.isLoading}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
              >
                导入已选 ({selectedIds.size})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
