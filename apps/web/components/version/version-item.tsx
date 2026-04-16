'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

interface VersionItemProps {
  version: {
    id: string; versionNumber: number; subVersionNumber: number | null;
    label: string | null; wordCount: number | null; isFinal: boolean | null;
    status: string | null; createdAt: string; parentVersionId: string | null;
  };
  chapterId: string;
  onLoad: (content: string) => void;
  subVersions?: VersionItemProps['version'][];
}

export function VersionItem({ version, chapterId, onLoad, subVersions }: VersionItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelInput, setLabelInput] = useState(version.label || '');
  const utils = trpc.useUtils();

  const getVersion = trpc.project.getChapterVersion.useQuery(
    { versionId: version.id }, { enabled: false },
  );
  const archiveMut = trpc.project.archiveChapterVersion.useMutation({
    onSuccess: () => utils.project.listChapterVersions.invalidate({ chapterId }),
  });
  const restoreMut = trpc.project.restoreChapterVersion.useMutation({
    onSuccess: () => utils.project.listChapterVersions.invalidate({ chapterId }),
  });
  const deleteMut = trpc.project.deleteChapterVersion.useMutation({
    onSuccess: () => utils.project.listChapterVersions.invalidate({ chapterId }),
  });
  const labelMut = trpc.project.updateVersionLabel.useMutation({
    onSuccess: () => { setEditingLabel(false); utils.project.listChapterVersions.invalidate({ chapterId }); },
  });
  const createSubMut = trpc.project.createSubVersion.useMutation({
    onSuccess: () => utils.project.listChapterVersions.invalidate({ chapterId }),
  });

  const vLabel = version.subVersionNumber && version.subVersionNumber > 0
    ? `v${version.versionNumber}.${version.subVersionNumber}`
    : `v${version.versionNumber}`;

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
        <span className="text-xs font-mono font-semibold text-gray-700">{vLabel}</span>
        {version.isFinal && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">定稿</span>}
        {isArchived && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">归档</span>}
        {editingLabel ? (
          <form onSubmit={e => { e.preventDefault(); labelMut.mutate({ versionId: version.id, label: labelInput }); }} className="flex gap-1 flex-1">
            <input value={labelInput} onChange={e => setLabelInput(e.target.value)} className="text-xs border rounded px-1 py-0.5 flex-1" autoFocus />
            <button type="submit" className="text-xs text-blue-600">保存</button>
          </form>
        ) : (
          <span className="text-xs text-gray-500 flex-1 truncate cursor-pointer" onClick={() => setEditingLabel(true)}>
            {version.label || '点击添加标签'}
          </span>
        )}
        <span className="text-xs text-gray-400">{version.wordCount ?? 0}字</span>
      </div>
      <div className="flex gap-1 px-3 pb-2">
        <button onClick={handleLoad} className="text-xs text-blue-600 hover:text-blue-800">加载</button>
        {!version.parentVersionId && <button onClick={handleCreateSub} className="text-xs text-gray-500 hover:text-gray-700">子版本</button>}
        {isArchived ? (
          <button onClick={() => restoreMut.mutate({ versionId: version.id, chapterId })} className="text-xs text-green-600 hover:text-green-800">恢复</button>
        ) : (
          <button onClick={() => archiveMut.mutate({ versionId: version.id, chapterId })} className="text-xs text-yellow-600 hover:text-yellow-800">归档</button>
        )}
        {!version.isFinal && (
          <button onClick={() => deleteMut.mutate({ versionId: version.id, chapterId })} className="text-xs text-red-400 hover:text-red-600">删除</button>
        )}
      </div>
      {expanded && hasSubs && (
        <div className="pl-6 pb-2 space-y-1">
          {subVersions!.map(sv => (
            <VersionItem key={sv.id} version={sv} chapterId={chapterId} onLoad={onLoad} />
          ))}
        </div>
      )}
    </div>
  );
}
