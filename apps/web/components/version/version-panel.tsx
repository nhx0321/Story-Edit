'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { SlidePanel } from '@/components/ui/slide-panel';

type VersionTab = 'task_brief' | 'draft' | 'final' | 'recycle';

interface VersionPanelProps {
  open: boolean;
  onClose: () => void;
  chapterId: string;
  projectId: string;
  onLoadVersion: (content: string) => void;
}

const TABS: { key: VersionTab; label: string }[] = [
  { key: 'task_brief', label: '任务书' },
  { key: 'draft', label: '正文编辑' },
  { key: 'final', label: '正文定稿' },
];

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}天前`;
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatFullTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function VersionPanel({ open, onClose, chapterId, projectId, onLoadVersion }: VersionPanelProps) {
  const [activeTab, setActiveTab] = useState<VersionTab>('draft');
  const [showArchived, setShowArchived] = useState(false);

  const { data: versions } = trpc.project.listChapterVersions.useQuery(
    { chapterId, includeArchived: showArchived }, { enabled: open },
  );

  const { data: recycleBin } = trpc.project.getRecycleBinVersions.useQuery(
    { chapterId }, { enabled: open && activeTab === 'recycle' },
  );

  const utils = trpc.useUtils();
  const restoreMut = trpc.project.restoreDeletedVersion.useMutation({
    onSuccess: () => {
      utils.project.getRecycleBinVersions.invalidate({ chapterId });
      utils.project.listChapterVersions.invalidate({ chapterId });
    },
  });
  const permanentDeleteMut = trpc.project.permanentDeleteVersion.useMutation({
    onSuccess: () => utils.project.getRecycleBinVersions.invalidate({ chapterId }),
  });
  const archiveMut = trpc.project.archiveChapterVersion.useMutation({
    onSuccess: () => utils.project.listChapterVersions.invalidate({ chapterId }),
  });
  const deleteMut = trpc.project.deleteChapterVersion.useMutation({
    onSuccess: () => utils.project.listChapterVersions.invalidate({ chapterId }),
  });

  const isRecycleBin = activeTab === 'recycle';

  // 过滤当前 Tab 的版本
  const filteredVersions = useMemo(() => {
    if (!versions) return [];
    if (isRecycleBin) return [];
    return versions.filter(v => v.versionType === activeTab);
  }, [versions, activeTab, isRecycleBin]);

  // 分组：主版本 + 子版本
  const { mainVersions, subMap } = useMemo(() => {
    const main = filteredVersions.filter(v => !v.parentVersionId);
    const subs = new Map<string, typeof filteredVersions>();
    filteredVersions.filter(v => v.parentVersionId).forEach(v => {
      const list = subs.get(v.parentVersionId!) || [];
      list.push(v);
      subs.set(v.parentVersionId!, list);
    });
    return { mainVersions: main, subMap: subs };
  }, [filteredVersions]);

  const recycleVersions = recycleBin || [];

  return (
    <SlidePanel open={open} onClose={onClose} title="版本管理">
      <div className="p-3 space-y-3">
        {/* Tab 切换 */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
                activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
            </button>
          ))}
          <button onClick={() => setActiveTab('recycle')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === 'recycle' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            回收站{recycleVersions.length > 0 && `(${recycleVersions.length})`}
          </button>
        </div>

        {/* 归档开关（非回收站） */}
        {!isRecycleBin && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{filteredVersions.length} 个版本</span>
            <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="rounded" />
              显示归档
            </label>
          </div>
        )}

        {/* 版本列表 */}
        {isRecycleBin ? (
          /* 回收站视图 */
          recycleVersions.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">回收站为空</p>
          ) : (
            <div className="space-y-2">
              {recycleVersions.map(v => (
                <div key={v.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-500">
                      v{v.versionNumber}{v.subVersionNumber ? `.${v.subVersionNumber}` : ''}
                    </span>
                    <span className="text-xs text-gray-400 flex-1">{formatTime(v.createdAt)}</span>
                    <span className="text-xs text-gray-300">删除于 {formatTime(v.deletedAt!)}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{v.wordCount ?? 0} 字 · {v.versionType === 'task_brief' ? '任务书' : v.versionType === 'final' ? '定稿' : '草稿'}</div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => restoreMut.mutate({ versionId: v.id, chapterId })}
                      className="text-xs text-green-600 hover:text-green-800">恢复</button>
                    <button onClick={() => { if (confirm('永久删除此版本？此操作不可恢复。')) permanentDeleteMut.mutate({ versionId: v.id, chapterId }); }}
                      className="text-xs text-red-500 hover:text-red-700">永久删除</button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-gray-400 text-center pt-2">删除超过 30 天的版本将自动清理</p>
            </div>
          )
        ) : (
          <div className="space-y-2">
            {mainVersions.map(v => (
              <VersionCard key={v.id} version={v} chapterId={chapterId}
                onLoad={onLoadVersion} subVersions={subMap.get(v.id)}
                archiveMut={archiveMut} deleteMut={deleteMut} restoreMut={restoreMut} />
            ))}
            {mainVersions.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">暂无{activeTab === 'task_brief' ? '任务书' : activeTab === 'final' ? '定稿' : '草稿'}版本</p>
            )}
          </div>
        )}
      </div>
    </SlidePanel>
  );
}

// ========== Version Card ==========

interface VersionCardProps {
  version: {
    id: string; versionNumber: number; subVersionNumber: number | null;
    label: string | null; wordCount: number | null; isFinal: boolean | null;
    status: string | null; createdAt: string; parentVersionId: string | null;
    versionType: string | null;
  };
  chapterId: string;
  onLoad: (content: string) => void;
  subVersions?: VersionCardProps['version'][];
  archiveMut: { mutate: (args: { versionId: string; chapterId: string }) => void };
  deleteMut: { mutate: (args: { versionId: string; chapterId: string }) => void };
  restoreMut: { mutate: (args: { versionId: string; chapterId: string }) => void };
}

function VersionCard({ version, chapterId, onLoad, subVersions, archiveMut, deleteMut, restoreMut }: VersionCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getVersion = trpc.project.getChapterVersion.useQuery(
    { versionId: version.id }, { enabled: false },
  );
  const utils = trpc.useUtils();
  const createSubMut = trpc.project.createSubVersion.useMutation({
    onSuccess: () => utils.project.listChapterVersions.invalidate({ chapterId }),
  });

  const isArchived = version.status === 'archived';
  const hasSubs = subVersions && subVersions.length > 0;

  const handleLoad = async () => {
    const result = await getVersion.refetch();
    if (result.data?.content) onLoad(result.data.content);
  };

  const handleCreateSub = async () => {
    const result = await getVersion.refetch();
    if (result.data?.content) {
      await createSubMut.mutateAsync({ parentVersionId: version.id, chapterId, content: result.data.content, label: '子版本' });
    }
  };

  return (
    <div className={`border rounded-lg ${isArchived ? 'border-dashed border-gray-300 opacity-60' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        {hasSubs && (
          <button onClick={() => setExpanded(!expanded)} className="text-gray-400 text-xs">{expanded ? '▼' : '▶'}</button>
        )}
        <span className="text-xs font-mono text-gray-500">
          v{version.versionNumber}{version.subVersionNumber ? `.${version.subVersionNumber}` : ''}
        </span>
        {version.isFinal && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">定稿</span>}
        {isArchived && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">归档</span>}
        <span className="text-xs text-gray-600 flex-1 truncate" title={formatFullTime(version.createdAt)}>
          {formatTime(version.createdAt)}
        </span>
        <span className="text-xs text-gray-400">{version.wordCount ?? 0}字</span>
      </div>
      <div className="flex gap-2 px-3 pb-2">
        <button onClick={handleLoad} className="text-xs text-blue-600 hover:text-blue-800">加载</button>
        {!version.parentVersionId && <button onClick={handleCreateSub} className="text-xs text-gray-500 hover:text-gray-700">子版本</button>}
        {isArchived ? (
          <button onClick={() => restoreMut.mutate({ versionId: version.id, chapterId })} className="text-xs text-green-600 hover:text-green-800">恢复</button>
        ) : (
          <button onClick={() => archiveMut.mutate({ versionId: version.id, chapterId })} className="text-xs text-yellow-600 hover:text-yellow-800">归档</button>
        )}
        <button onClick={() => {
          if (version.isFinal && !isArchived) {
            if (!confirm('删除定稿版本将移入回收站，30天后自动清理。确认删除？')) return;
          }
          deleteMut.mutate({ versionId: version.id, chapterId });
        }} className={`text-xs ${version.isFinal ? 'text-orange-400 hover:text-orange-600' : 'text-red-400 hover:text-red-600'}`}>删除</button>
      </div>
      {expanded && hasSubs && (
        <div className="pl-6 pb-2 space-y-1">
          {subVersions!.map(sv => (
            <VersionCard key={sv.id} version={sv} chapterId={chapterId} onLoad={onLoad}
              archiveMut={archiveMut} deleteMut={deleteMut} restoreMut={restoreMut} />
          ))}
        </div>
      )}
    </div>
  );
}
