'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { ChatPanel } from '@/components/chat/chat-panel';

export default function ChaptersPage({ params }: { params: { id: string } }) {
  const projectId = params.id;
  const [expandedVolumes, setExpandedVolumes] = useState<Set<string>>(new Set());
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [chatOpen, setChatOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: volumeList, isLoading } = trpc.project.listVolumes.useQuery({ projectId });

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

  const statusLabel = (s: string | null) => {
    switch (s) {
      case 'final': return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">已定稿</span>;
      case 'draft': return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">草稿</span>;
      default: return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">待创作</span>;
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">加载中...</p></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <Link href={`/project/${projectId}`} className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回项目</Link>
        <div className="flex items-center justify-between mt-4 mb-6">
          <h1 className="text-2xl font-bold">正文</h1>
          <div className="flex gap-2">
            <button onClick={() => setChatOpen(true)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-500 transition">
              AI 创作
            </button>
          </div>
        </div>

        {(!volumeList || volumeList.length === 0) ? (
          <div className="text-center py-16 text-gray-400">
            <p className="mb-2">还没有创建卷，请先在大纲中规划结构</p>
            <Link href={`/project/${projectId}/outline`} className="text-gray-900 font-medium hover:underline">前往大纲</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {volumeList.map(vol => (
              <VolumeBlock key={vol.id} vol={vol} projectId={projectId}
                expanded={expandedVolumes.has(vol.id)} onToggle={() => toggleVolume(vol.id)}
                expandedUnits={expandedUnits} toggleUnit={toggleUnit}
                statusLabel={statusLabel} />
            ))}
          </div>
        )}
      </div>

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)}
        projectId={projectId} conversationType="chapter" roleKey="writer" title="AI 创作"
        onActionConfirmed={() => {
          utils.project.listVolumes.invalidate({ projectId });
          utils.project.listUnits.invalidate();
          utils.project.listChapters.invalidate();
        }} />
    </div>
  );
}

// ========== 卷区块 ==========
function VolumeBlock({ vol, projectId, expanded, onToggle, expandedUnits, toggleUnit, statusLabel }: {
  vol: { id: string; title: string; synopsis?: string | null };
  projectId: string; expanded: boolean; onToggle: () => void;
  expandedUnits: Set<string>; toggleUnit: (id: string) => void;
  statusLabel: (s: string | null) => React.ReactNode;
}) {
  const { data: unitList } = trpc.project.listUnits.useQuery(
    { volumeId: vol.id }, { enabled: expanded },
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <button onClick={onToggle} className="w-full text-left px-5 py-4 flex items-center justify-between">
        <span className="font-semibold">{vol.title}</span>
        <span className="text-gray-400 text-sm">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="px-5 pb-4 space-y-2">
          {unitList?.map(unit => (
            <UnitBlock key={unit.id} unit={unit} projectId={projectId} volumeId={vol.id}
              expanded={expandedUnits.has(unit.id)} onToggle={() => toggleUnit(unit.id)}
              statusLabel={statusLabel} />
          ))}
          {unitList?.length === 0 && <p className="text-sm text-gray-400 px-4">暂无单元</p>}
        </div>
      )}
    </div>
  );
}

// ========== 单元区块 ==========
function UnitBlock({ unit, projectId, volumeId, expanded, onToggle, statusLabel }: {
  unit: { id: string; title: string };
  projectId: string; volumeId: string; expanded: boolean; onToggle: () => void;
  statusLabel: (s: string | null) => React.ReactNode;
}) {
  const { data: chapterList } = trpc.project.listChapters.useQuery(
    { unitId: unit.id }, { enabled: expanded },
  );

  return (
    <div className="border border-gray-100 rounded-lg">
      <button onClick={onToggle} className="w-full text-left px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-medium">{unit.title}</span>
        <span className="text-gray-400 text-xs">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-1">
          {chapterList?.map(ch => (
            <ChapterRow key={ch.id} ch={ch} projectId={projectId} />
          ))}
          {chapterList?.length === 0 && <p className="text-xs text-gray-400 px-3">暂无章节</p>}
        </div>
      )}
    </div>
  );
}

// ========== 章节行 ==========
function ChapterRow({ ch, projectId }: {
  ch: { id: string; title: string; status: string | null; wordCount?: number | null };
  projectId: string;
}) {
  return (
    <Link href={`/project/${projectId}/chapter/${ch.id}`}
      className="flex items-center justify-between px-3 py-2 rounded hover:bg-gray-50 transition">
      <span className="text-sm">{ch.title}</span>
      <div className="flex items-center gap-3">
        {ch.wordCount != null && <span className="text-xs text-gray-400">{ch.wordCount} 字</span>}
        {statusLabel(ch.status)}
      </div>
    </Link>
  );
}

function statusLabel(s: string | null) {
  switch (s) {
    case 'final': return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">已定稿</span>;
    case 'draft': return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">草稿</span>;
    default: return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">待创作</span>;
  }
}
