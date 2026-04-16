'use client';

import { useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc';

const SPECIES_LABELS: Record<string, string> = {
  plant: '植物系',
  animal: '动物系',
  element: '元素系',
};

const TEXT_TYPE_LABELS: Record<string, string> = {
  'user-trigger': '用户触发',
  'idle-phase': '待机阶段',
};

const STATUS_CONFIG: Record<string, { label: string; dotColor: string; textColor: string }> = {
  draft: { label: '草稿', dotColor: 'bg-gray-400', textColor: 'text-gray-500' },
  confirmed: { label: '已确认', dotColor: 'bg-blue-500', textColor: 'text-blue-600' },
  published: { label: '已上线', dotColor: 'bg-green-500', textColor: 'text-green-600' },
  failed: { label: '失败', dotColor: 'bg-red-500', textColor: 'text-red-600' },
};

// ============================================================
// SpriteTextPanel — 精灵文本管理面板
// ============================================================

export function SpriteTextPanel() {
  const utils = trpc.useUtils();

  // Selection
  const [selectedSpecies, setSelectedSpecies] = useState('plant');
  const [selectedVariant, setSelectedVariant] = useState('sunflower');
  const [selectedLevelFilter, setSelectedLevelFilter] = useState<number | 'all'>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'all' | 'user-trigger' | 'idle-phase'>('all');

  // Checkbox selection for batch operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Batch submit progress
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; errors: string[] } | null>(null);

  // Form state for create/edit
  const [editingEntry, setEditingEntry] = useState<{
    id?: string;
    species: string;
    variant: string;
    level: number;
    textType: 'user-trigger' | 'idle-phase';
    triggerCondition: string;
    responseText: string;
  } | null>(null);

  const [showForm, setShowForm] = useState(false);

  // Sync mutation
  const syncMutation = trpc.spriteText.syncEntries.useMutation({
    onSuccess: () => {
      utils.spriteText.listEntries.invalidate({ species: selectedSpecies, variant: selectedVariant });
    },
    onError: (e) => alert(`同步失败: ${e.message}`),
  });

  // Query entries
  const { data, isLoading } = trpc.spriteText.listEntries.useQuery(
    { species: selectedSpecies, variant: selectedVariant },
    { refetchOnWindowFocus: false },
  );

  // CRUD mutations
  const createMutation = trpc.spriteText.createEntry.useMutation({
    onSuccess: () => {
      utils.spriteText.listEntries.invalidate({ species: selectedSpecies, variant: selectedVariant });
      setEditingEntry(null);
      setShowForm(false);
    },
    onError: (e) => alert(`创建失败: ${e.message}`),
  });

  const updateMutation = trpc.spriteText.updateEntry.useMutation({
    onSuccess: () => {
      utils.spriteText.listEntries.invalidate({ species: selectedSpecies, variant: selectedVariant });
      setEditingEntry(null);
      setShowForm(false);
    },
    onError: (e) => alert(`更新失败: ${e.message}`),
  });

  const deleteMutation = trpc.spriteText.deleteEntry.useMutation({
    onSuccess: () => {
      utils.spriteText.listEntries.invalidate({ species: selectedSpecies, variant: selectedVariant });
    },
    onError: (e) => alert(`删除失败: ${e.message}`),
  });

  const publishMutation = trpc.spriteText.publishEntry.useMutation({
    onSuccess: () => {
      utils.spriteText.listEntries.invalidate({ species: selectedSpecies, variant: selectedVariant });
    },
    onError: (e) => alert(`上线失败: ${e.message}`),
  });

  const unpublishMutation = trpc.spriteText.unpublishEntry.useMutation({
    onSuccess: () => {
      utils.spriteText.listEntries.invalidate({ species: selectedSpecies, variant: selectedVariant });
    },
    onError: (e) => alert(`操作失败: ${e.message}`),
  });

  const applyToAllLevelsMutation = trpc.spriteText.applyToAllLevels.useMutation({
    onSuccess: () => {
      utils.spriteText.listEntries.invalidate({ species: selectedSpecies, variant: selectedVariant });
    },
    onError: (e) => alert(`操作失败: ${e.message}`),
  });

  const submitToAIMutation = trpc.spriteText.submitToAI.useMutation({
    onSuccess: () => {
      utils.spriteText.listEntries.invalidate({ species: selectedSpecies, variant: selectedVariant });
    },
    onError: (e) => alert(`提交AI失败: ${e.message}`),
  });

  const retryFailedMutation = trpc.spriteText.retryFailedTask.useMutation({
    onSuccess: () => {
      utils.spriteText.listEntries.invalidate({ species: selectedSpecies, variant: selectedVariant });
    },
    onError: (e) => alert(`重试失败: ${e.message}`),
  });

  // Filtered entries
  const entries = data?.entries || [];
  const filtered = entries.filter(e => {
    if (selectedLevelFilter !== 'all' && e.level !== selectedLevelFilter) return false;
    if (selectedTypeFilter !== 'all' && e.textType !== selectedTypeFilter) return false;
    return true;
  });

  // Group entries by level for display
  const groupedByLevel: Record<number, typeof entries> = {};
  for (const entry of filtered) {
    if (!groupedByLevel[entry.level]) groupedByLevel[entry.level] = [];
    groupedByLevel[entry.level].push(entry);
  }

  // Selectable entries: draft, confirmed, or failed status with content
  const selectableIds = entries
    .filter(e => (e.status === 'draft' || e.status === 'confirmed' || e.status === 'failed') && e.triggerCondition && e.responseText)
    .map(e => e.id);

  const isAllSelected = selectableIds.length > 0 && selectedIds.size === selectableIds.length;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Batch submit selected entries to AI
  const handleBatchSubmitSelected = async () => {
    const selectedEntries = entries.filter(e => selectedIds.has(e.id));
    if (selectedEntries.length === 0) return;
    if (!confirm(`确定要提交 ${selectedEntries.length} 个条目到AI处理吗？`)) return;

    setBatchSubmitting(true);
    const errors: string[] = [];
    let done = 0;

    setBatchProgress({ current: 0, total: selectedEntries.length, errors });

    for (const entry of selectedEntries) {
      try {
        await submitToAIMutation.mutateAsync({ entryId: entry.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`L${entry.level} ${TEXT_TYPE_LABELS[entry.textType]}: ${msg}`);
      }
      done++;
      setBatchProgress({ current: done, total: selectedEntries.length, errors });
    }

    utils.spriteText.listEntries.invalidate({ species: selectedSpecies, variant: selectedVariant });
    setSelectedIds(new Set());
    setBatchSubmitting(false);
  };

  // Submit ALL eligible entries
  const handleBatchSubmitAll = async () => {
    const eligible = entries.filter(e =>
      (e.status === 'draft' || e.status === 'confirmed' || e.status === 'failed') &&
      e.triggerCondition &&
      e.responseText
    );
    if (eligible.length === 0) {
      alert('没有可提交的条目（需要触发条件和回复文本不为空）');
      return;
    }
    if (!confirm(`确定要提交全部 ${eligible.length} 个条目到AI处理吗？`)) return;

    setBatchSubmitting(true);
    const errors: string[] = [];
    let done = 0;

    setBatchProgress({ current: 0, total: eligible.length, errors });

    for (const entry of eligible) {
      try {
        await submitToAIMutation.mutateAsync({ entryId: entry.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`L${entry.level} ${TEXT_TYPE_LABELS[entry.textType]}: ${msg}`);
      }
      done++;
      setBatchProgress({ current: done, total: eligible.length, errors });
    }

    utils.spriteText.listEntries.invalidate({ species: selectedSpecies, variant: selectedVariant });
    setSelectedIds(new Set());
    setBatchSubmitting(false);
  };

  const availableVariants = getVariantsForSpecies(selectedSpecies);

  const handleCreate = () => {
    setEditingEntry({
      species: selectedSpecies,
      variant: selectedVariant,
      level: -1,
      textType: 'user-trigger',
      triggerCondition: '',
      responseText: '',
    });
    setShowForm(true);
  };

  const handleEdit = (entry: typeof entries[number]) => {
    setEditingEntry({
      id: entry.id,
      species: entry.species,
      variant: entry.variant,
      level: entry.level,
      textType: entry.textType,
      triggerCondition: entry.triggerCondition,
      responseText: entry.responseText,
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!editingEntry) return;
    if (!editingEntry.triggerCondition.trim() || !editingEntry.responseText.trim()) {
      alert('触发条件和回复文本不能为空');
      return;
    }

    if (editingEntry.id) {
      updateMutation.mutate({
        id: editingEntry.id,
        triggerCondition: editingEntry.triggerCondition,
        responseText: editingEntry.responseText,
        textType: editingEntry.textType,
        level: editingEntry.level,
      });
    } else {
      createMutation.mutate({
        species: editingEntry.species,
        variant: editingEntry.variant,
        level: editingEntry.level,
        textType: editingEntry.textType,
        triggerCondition: editingEntry.triggerCondition,
        responseText: editingEntry.responseText,
      });
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm('确定要删除此文本条目吗？')) return;
    deleteMutation.mutate({ id });
  };

  const handlePreviewLevel = (level: number) => {
    const channel = new BroadcastChannel('sprite-admin-preview');
    channel.postMessage({ type: 'preview-level', level });
    channel.close();
  };

  return (
    <div>
      {/* Instructions */}
      <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
        <span className="text-amber-500 text-lg mt-0.5">💡</span>
        <div className="text-sm text-amber-800">
          <p className="font-medium">精灵文本管理</p>
          <p className="text-xs text-amber-600 mt-1">
            管理精灵与用户之间的交互文本。先在"通用"等级创建模板 → 点击"应用到全部等级" → 在各等级独立修改 → 确认后上线。
          </p>
        </div>
      </div>

      {/* Sprite selector + sync */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">选择精灵:</label>
          <select
            value={selectedSpecies}
            onChange={(e) => {
              setSelectedSpecies(e.target.value);
              setSelectedVariant(getVariantsForSpecies(e.target.value)[0] || '');
            }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            {Object.entries(SPECIES_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <span className="text-gray-400">/</span>
          <select
            value={selectedVariant}
            onChange={(e) => setSelectedVariant(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            {availableVariants.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="ml-auto px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition disabled:opacity-50"
          >
            {syncMutation.isPending ? '同步中...' : '刷新同步'}
          </button>
        </div>
      </div>

      {/* Level filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-gray-500">等级标签:</span>
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setSelectedLevelFilter('all')}
            className={`px-3 py-1 text-xs rounded transition ${selectedLevelFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            全部
          </button>
          <button
            onClick={() => setSelectedLevelFilter(-1)}
            className={`px-3 py-1 text-xs rounded transition ${selectedLevelFilter === -1 ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}
          >
            通用
          </button>
          {Array.from({ length: 10 }, (_, i) => (
            <button
              key={i}
              onClick={() => setSelectedLevelFilter(i)}
              className={`px-3 py-1 text-xs rounded transition ${selectedLevelFilter === i ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              L{i}
            </button>
          ))}
        </div>
      </div>

      {/* Type filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-gray-500">类型筛选:</span>
          {(['all', 'user-trigger', 'idle-phase'] as const).map(type => (
            <button
              key={type}
              onClick={() => setSelectedTypeFilter(type)}
              className={`px-3 py-1 text-xs rounded transition ${selectedTypeFilter === type ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {type === 'all' ? '全部' : TEXT_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Batch action bar */}
      {entries.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4">
          <div className="flex items-center gap-3">
            {/* Select all checkbox */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">全选</span>
            </label>

            {selectedIds.size > 0 && (
              <span className="text-sm text-blue-600 font-medium">
                已选 {selectedIds.size} 项
              </span>
            )}

            {/* Batch submit selected */}
            <button
              onClick={handleBatchSubmitSelected}
              disabled={selectedIds.size === 0 || batchSubmitting}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              批量提交 ({selectedIds.size})
            </button>

            {/* Submit all */}
            <button
              onClick={handleBatchSubmitAll}
              disabled={batchSubmitting}
              className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              一键全部提交
            </button>

            {/* Progress bar */}
            {batchProgress && (
              <div className="ml-auto flex items-center gap-2">
                <div className="w-48 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">
                  {batchProgress.current}/{batchProgress.total}
                </span>
                {batchProgress.errors.length > 0 && (
                  <span className="text-xs text-red-500">
                    失败 {batchProgress.errors.length} 项
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Error details */}
          {batchProgress && batchProgress.errors.length > 0 && (
            <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              {batchProgress.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-600">{err}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Entry cards */}
      <div className="space-y-4 mb-4">
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">暂无文本条目，点击下方按钮添加</div>
        ) : (
          Object.entries(groupedByLevel)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([levelStr, levelEntries]) => {
              const level = Number(levelStr);
              const isTemplate = level === -1;
              return (
                <div key={levelStr}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${isTemplate ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                      {isTemplate ? '通用模板' : `L${level}`}
                    </span>
                    <span className="text-xs text-gray-400">{levelEntries.length} 条</span>
                    {!isTemplate && (
                      <button
                        onClick={() => handlePreviewLevel(level)}
                        className="ml-auto px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition"
                      >
                        预览此等级
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {levelEntries.map(entry => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        task={data?.tasks?.[entry.id]?.[0] || null}
                        selected={selectedIds.has(entry.id)}
                        selectable={selectableIds.includes(entry.id)}
                        onToggleSelect={() => handleToggleSelect(entry.id)}
                        onEdit={() => handleEdit(entry)}
                        onDelete={() => handleDelete(entry.id)}
                        onPublish={() => publishMutation.mutate({ id: entry.id })}
                        onUnpublish={() => unpublishMutation.mutate({ id: entry.id })}
                        onApplyToAll={() => applyToAllLevelsMutation.mutate({ entryId: entry.id })}
                        onSubmitAI={() => submitToAIMutation.mutate({ entryId: entry.id })}
                        onRetryAI={() => retryFailedMutation.mutate({ entryId: entry.id })}
                      />
                    ))}
                  </div>
                </div>
              );
            })
        )}
      </div>

      {/* Add new button */}
      <button
        onClick={handleCreate}
        className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-400 hover:border-gray-400 hover:text-gray-600 transition"
      >
        + 添加新文本
      </button>

      {/* Create/Edit form modal */}
      {showForm && editingEntry && (
        <EntryFormModal
          entry={editingEntry}
          onChange={setEditingEntry}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingEntry(null); }}
          isSaving={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  );
}

// ============================================================
// EntryCard — 单个文本条目卡片
// ============================================================

function EntryCard({
  entry,
  task,
  selected,
  selectable,
  onToggleSelect,
  onEdit,
  onDelete,
  onPublish,
  onUnpublish,
  onApplyToAll,
  onSubmitAI,
  onRetryAI,
}: {
  entry: {
    id: string;
    species: string;
    variant: string;
    level: number;
    textType: string;
    triggerCondition: string;
    responseText: string;
    status: string;
    errorMessage: string | null;
  };
  task: { status: string; errorMessage: string | null } | null;
  selected: boolean;
  selectable: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onApplyToAll: () => void;
  onSubmitAI: () => void;
  onRetryAI: () => void;
}) {
  const config = STATUS_CONFIG[entry.status] || STATUS_CONFIG.draft;
  const isTemplate = entry.level === -1;

  return (
    <div className={`bg-white rounded-xl border p-4 transition ${selected ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200'}`}>
      {/* Header: checkbox + type + status */}
      <div className="flex items-center gap-2 mb-2">
        <label className="flex items-center gap-1 cursor-pointer select-none" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            disabled={!selectable}
            className="w-4 h-4 rounded border-gray-300 disabled:opacity-30"
          />
        </label>
        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
          {TEXT_TYPE_LABELS[entry.textType] || entry.textType}
        </span>
        <span className={`flex items-center gap-1 text-xs font-medium ${config.textColor}`}>
          <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
          {config.label}
        </span>
        {task && (
          <span className={`ml-auto text-xs px-2 py-0.5 rounded ${
            task.status === 'success' ? 'bg-green-50 text-green-600' :
            task.status === 'failed' ? 'bg-red-50 text-red-600' :
            task.status === 'in_progress' ? 'bg-blue-50 text-blue-600' :
            'bg-yellow-50 text-yellow-600'
          }`}>
            AI: {task.status === 'success' ? '成功' : task.status === 'failed' ? '失败' : task.status === 'in_progress' ? '处理中' : '等待中'}
          </span>
        )}
      </div>

      {/* Trigger condition */}
      <div className="mb-2 ml-6">
        <span className="text-xs font-medium text-gray-500">触发条件:</span>
        <p className="text-sm text-gray-700 mt-0.5 line-clamp-2">{entry.triggerCondition || <span className="text-gray-300">（空）</span>}</p>
      </div>

      {/* Response text */}
      <div className="mb-3 ml-6">
        <span className="text-xs font-medium text-gray-500">回复文本:</span>
        <p className="text-sm text-gray-700 mt-0.5 line-clamp-3">{entry.responseText || <span className="text-gray-300">（空）</span>}</p>
      </div>

      {/* Error message */}
      {entry.errorMessage && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-600">错误: {entry.errorMessage}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 ml-6">
        <button onClick={onEdit} className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition">
          编辑
        </button>
        <button onClick={onDelete} className="px-3 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded transition">
          删除
        </button>

        {entry.status === 'draft' && (
          <button onClick={onPublish} className="px-3 py-1 text-xs bg-green-50 text-green-600 hover:bg-green-100 rounded transition">
            上线
          </button>
        )}
        {entry.status === 'published' && (
          <button onClick={onUnpublish} className="px-3 py-1 text-xs bg-yellow-50 text-yellow-600 hover:bg-yellow-100 rounded transition">
            取消上线
          </button>
        )}
        {(entry.status === 'draft' || entry.status === 'confirmed') && (
          <button onClick={onSubmitAI} className="px-3 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded transition">
            提交AI
          </button>
        )}
        {entry.status === 'failed' && (
          <button onClick={onRetryAI} className="px-3 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded transition">
            重新提交
          </button>
        )}

        {isTemplate && entry.triggerCondition && entry.responseText && (
          <button onClick={onApplyToAll} className="ml-auto px-3 py-1 text-xs bg-purple-50 text-purple-600 hover:bg-purple-100 rounded transition">
            应用到全部等级
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// EntryFormModal — 创建/编辑表单
// ============================================================

function EntryFormModal({
  entry,
  onChange,
  onSave,
  onCancel,
  isSaving,
}: {
  entry: {
    id?: string;
    species: string;
    variant: string;
    level: number;
    textType: 'user-trigger' | 'idle-phase';
    triggerCondition: string;
    responseText: string;
  };
  onChange: (e: typeof entry) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          {entry.id ? '编辑文本条目' : '新建文本条目'}
        </h3>

        {/* Level selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">等级</label>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => onChange({ ...entry, level: -1 })}
              className={`px-3 py-1.5 text-sm rounded transition ${entry.level === -1 ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}
            >
              通用
            </button>
            {Array.from({ length: 10 }, (_, i) => (
              <button
                key={i}
                onClick={() => onChange({ ...entry, level: i })}
                className={`px-3 py-1.5 text-sm rounded transition ${entry.level === i ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                L{i}
              </button>
            ))}
          </div>
        </div>

        {/* Text type */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">交互类型</label>
          <div className="flex gap-2">
            {(['user-trigger', 'idle-phase'] as const).map(type => (
              <button
                key={type}
                onClick={() => onChange({ ...entry, textType: type })}
                className={`flex-1 py-2 text-sm rounded-lg border transition ${entry.textType === type ? 'border-gray-900 bg-gray-50 text-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
              >
                {TEXT_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {/* Trigger condition */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">触发条件</label>
          <textarea
            value={entry.triggerCondition}
            onChange={(e) => onChange({ ...entry, triggerCondition: e.target.value })}
            placeholder="描述何时触发此交互，例如：当用户第一次打开页面时"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y"
          />
        </div>

        {/* Response text */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">回复文本</label>
          <textarea
            value={entry.responseText}
            onChange={(e) => onChange({ ...entry, responseText: e.target.value })}
            placeholder="精灵的回复内容"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[100px] resize-y"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function getVariantsForSpecies(species: string): string[] {
  const variants: Record<string, string[]> = {
    plant: ['sunflower'],
    animal: ['fox'],
    element: ['wind'],
  };
  return variants[species] || [];
}
