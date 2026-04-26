'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

interface OutlineSidebarProps {
  projectId: string;
  currentChapterId?: string;
  /** 是否在正文创作页面中作为内嵌侧边栏 */
  embedded?: boolean;
}

export function OutlineSidebar({ projectId, currentChapterId, embedded }: OutlineSidebarProps) {
  const { data: outlineTree } = trpc.project.getOutlineTree.useQuery(
    { projectId },
    { enabled: true },
  );

  const [expandedVolumes, setExpandedVolumes] = useState<Set<string>>(new Set());
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());

  // Auto-expand the volume/unit containing the current chapter
  useEffect(() => {
    if (!outlineTree || !currentChapterId) return;
    const nextVolumes = new Set(expandedVolumes);
    const nextUnits = new Set(expandedUnits);
    let changed = false;

    for (const vol of outlineTree) {
      for (const unit of vol.units || []) {
        if (unit.chapters?.some(ch => ch.id === currentChapterId)) {
          if (!nextVolumes.has(vol.id)) { nextVolumes.add(vol.id); changed = true; }
          if (!nextUnits.has(unit.id)) { nextUnits.add(unit.id); changed = true; }
        }
      }
    }

    if (changed) {
      setExpandedVolumes(nextVolumes);
      setExpandedUnits(nextUnits);
    }
  }, [outlineTree, currentChapterId]);

  if (!outlineTree || outlineTree.length === 0) {
    return (
      <aside className={`${embedded ? 'w-56' : 'w-56'} bg-white border-r border-gray-200 p-4 flex flex-col shrink-0`}>
        <div className="text-xs text-gray-400 text-center py-8">暂无大纲</div>
      </aside>
    );
  }

  return (
    <aside className={`${embedded ? 'w-56' : 'w-56'} bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto`}>
      <div className="p-3 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">大纲目录</h3>
      </div>
      <div className="flex-1 p-2 space-y-0.5 text-sm">
        {outlineTree.map(vol => {
          const isVolExpanded = expandedVolumes.has(vol.id);
          const hasUnits = vol.units && vol.units.length > 0;
          return (
            <div key={vol.id}>
              <button
                onClick={() => {
                  const next = new Set(expandedVolumes);
                  next.has(vol.id) ? next.delete(vol.id) : next.add(vol.id);
                  setExpandedVolumes(next);
                }}
                className="w-full flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-gray-100 text-left transition"
              >
                <span className="text-xs text-gray-400 w-4 shrink-0">
                  {hasUnits ? (isVolExpanded ? '▼' : '▶') : '·'}
                </span>
                <span className="font-medium text-gray-800 truncate">{vol.title}</span>
              </button>

              {isVolExpanded && hasUnits && (
                <div className="ml-3 space-y-0.5">
                  {vol.units!.map(unit => {
                    const isUnitExpanded = expandedUnits.has(unit.id);
                    const hasChapters = unit.chapters && unit.chapters.length > 0;
                    return (
                      <div key={unit.id}>
                        <button
                          onClick={() => {
                            const next = new Set(expandedUnits);
                            next.has(unit.id) ? next.delete(unit.id) : next.add(unit.id);
                            setExpandedUnits(next);
                          }}
                          className="w-full flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-gray-100 text-left transition"
                        >
                          <span className="text-xs text-gray-400 w-4 shrink-0">
                            {hasChapters ? (isUnitExpanded ? '▼' : '▶') : '·'}
                          </span>
                          <span className="text-gray-600 truncate text-xs">{unit.title}</span>
                        </button>

                        {isUnitExpanded && hasChapters && (
                          <div className="ml-3 space-y-0.5">
                            {unit.chapters!.map(ch => {
                              const isActive = ch.id === currentChapterId;
                              return (
                                <Link
                                  key={ch.id}
                                  href={`/project/${projectId}/chapter/${ch.id}`}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition text-xs ${
                                    isActive
                                      ? 'bg-gray-900 text-white font-medium'
                                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  <span className="truncate">{ch.title}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
