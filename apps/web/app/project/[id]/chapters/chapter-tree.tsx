'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

function statusBadge(s: string | null) {
  switch (s) {
    case 'final': return <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full leading-none">已定稿</span>;
    case 'draft': return <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full leading-none">草稿</span>;
    default: return <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full leading-none">待创作</span>;
  }
}

export function ChapterTree({
  projectId,
  selectedChapterId,
  onSelectChapter,
}: {
  projectId: string;
  selectedChapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
}) {
  const [expandedVolumes, setExpandedVolumes] = useState<Set<string>>(new Set());
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [autoExpanded, setAutoExpanded] = useState(false);

  const { data: volumeList, isLoading } = trpc.project.listVolumes.useQuery({ projectId });

  // 当有选中章节但树未展开时，自动展开所有卷和单元
  useEffect(() => {
    if (selectedChapterId && volumeList && volumeList.length > 0 && !autoExpanded) {
      setExpandedVolumes(new Set(volumeList.map(v => v.id)));
      setAutoExpanded(true);
    }
  }, [selectedChapterId, volumeList, autoExpanded]);

  const toggleVolume = (id: string) => {
    const next = new Set(expandedVolumes);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedVolumes(next);
  };

  const toggleUnit = (id: string) => {
    const next = new Set(expandedUnits);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedUnits(next);
  };

  const autoExpandUnits = useCallback((unitIds: string[]) => {
    setExpandedUnits(prev => {
      const next = new Set(prev);
      unitIds.forEach(id => next.add(id));
      return next;
    });
  }, []);

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-400">加载中...</div>;
  }

  if (!volumeList || volumeList.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-gray-400 mb-2">还没有创建卷</p>
        <Link href={`/project/${projectId}/outline`}
          className="text-sm text-gray-900 font-medium hover:underline">
          前往大纲规划结构
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto py-2">
        {volumeList.map(vol => (
          <VolumeNode key={vol.id} vol={vol} projectId={projectId}
            expanded={expandedVolumes.has(vol.id)} onToggle={() => toggleVolume(vol.id)}
            expandedUnits={expandedUnits} toggleUnit={toggleUnit}
            selectedChapterId={selectedChapterId} onSelectChapter={onSelectChapter}
            autoExpandUnits={autoExpandUnits} />
        ))}
      </div>
      <div className="border-t border-gray-100 px-3 py-2">
        <Link href={`/project/${projectId}/outline`}
          className="text-xs text-gray-400 hover:text-gray-600 transition">
          修改卷/单元结构 → 前往大纲
        </Link>
      </div>
    </div>
  );
}

function VolumeNode({ vol, projectId, expanded, onToggle, expandedUnits, toggleUnit, selectedChapterId, onSelectChapter, autoExpandUnits }: {
  vol: { id: string; title: string; synopsis?: string | null };
  projectId: string; expanded: boolean; onToggle: () => void;
  expandedUnits: Set<string>; toggleUnit: (id: string) => void;
  selectedChapterId: string | null; onSelectChapter: (id: string) => void;
  autoExpandUnits: (unitIds: string[]) => void;
}) {
  const { data: unitList } = trpc.project.listUnits.useQuery(
    { volumeId: vol.id }, { enabled: expanded },
  );

  // 自动展开所有单元（当有选中章节时）
  useEffect(() => {
    if (unitList && unitList.length > 0 && selectedChapterId) {
      const notExpanded = unitList.filter(u => !expandedUnits.has(u.id));
      if (notExpanded.length > 0) {
        autoExpandUnits(notExpanded.map(u => u.id));
      }
    }
  }, [unitList, selectedChapterId, expandedUnits, autoExpandUnits]);

  return (
    <div className="mb-1">
      <button onClick={onToggle}
        className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-gray-50 transition rounded-md mx-1"
        style={{ width: 'calc(100% - 8px)' }}>
        <span className="text-gray-400 text-[10px]">{expanded ? '▼' : '▶'}</span>
        <span className="text-sm font-semibold text-gray-700 truncate">{vol.title}</span>
      </button>
      {expanded && (
        <div className="ml-3">
          {unitList?.map(unit => (
            <UnitNode key={unit.id} unit={unit} projectId={projectId}
              expanded={expandedUnits.has(unit.id)} onToggle={() => toggleUnit(unit.id)}
              selectedChapterId={selectedChapterId} onSelectChapter={onSelectChapter} />
          ))}
          {unitList?.length === 0 && <p className="text-xs text-gray-400 px-3 py-1">暂无单元</p>}
        </div>
      )}
    </div>
  );
}

function UnitNode({ unit, projectId, expanded, onToggle, selectedChapterId, onSelectChapter }: {
  unit: { id: string; title: string };
  projectId: string; expanded: boolean; onToggle: () => void;
  selectedChapterId: string | null; onSelectChapter: (id: string) => void;
}) {
  const { data: chapterList } = trpc.project.listChapters.useQuery(
    { unitId: unit.id }, { enabled: expanded },
  );

  return (
    <div className="mb-0.5">
      <button onClick={onToggle}
        className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-50 transition rounded-md mx-1"
        style={{ width: 'calc(100% - 8px)' }}>
        <span className="text-gray-400 text-[10px]">{expanded ? '▼' : '▶'}</span>
        <span className="text-xs font-medium text-gray-600 truncate">{unit.title}</span>
      </button>
      {expanded && (
        <div className="ml-3">
          {chapterList?.map(ch => (
            <button key={ch.id} onClick={() => onSelectChapter(ch.id)}
              className={`w-full text-left px-3 py-1.5 flex items-center justify-between rounded-md mx-1 transition ${
                selectedChapterId === ch.id
                  ? 'bg-gray-900 text-white'
                  : 'hover:bg-gray-50 text-gray-700'
              }`}
              style={{ width: 'calc(100% - 8px)' }}>
              <span className="text-xs truncate">{ch.title}</span>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {selectedChapterId !== ch.id && statusBadge(ch.status)}
              </div>
            </button>
          ))}
          {chapterList?.length === 0 && <p className="text-[10px] text-gray-400 px-3 py-1">暂无章节</p>}
        </div>
      )}
    </div>
  );
}
