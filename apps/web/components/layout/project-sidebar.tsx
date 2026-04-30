'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import type { WorkflowProgress } from '@/lib/use-workflow-progress';

interface SidebarItem {
  href: string | ((projectId: string) => string);
  label: string;
  icon: string;
  /** 完成条件检查 */
  isComplete?: (progress: WorkflowProgress) => boolean;
  /** 是否为推荐的下一步（脉冲动画） */
  isNext?: (progress: WorkflowProgress) => boolean;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { href: '', label: '项目概览', icon: '□' },
  {
    href: '/outline', label: '大纲编辑', icon: '≡',
    isComplete: (p) => p.hasChapters,
  },
  {
    href: '/settings', label: '设定管理', icon: '▣',
    isComplete: (p) => p.settingComplete,
  },
  {
    href: '/chapters', label: '正文创作', icon: '▤',
    isNext: (p) => p.hasChapters && !p.chapterDraft && !p.chapterFinal,
  },
];

interface ProjectSidebarProps {
  projectId: string;
  projectName: string;
  projectGenre?: string | null;
  projectStyle?: string | null;
  currentPath: string;
  progress: WorkflowProgress;
  onExport?: () => void;
  exportDisabled?: boolean;
  exportDisabledTitle?: string;
}

export function ProjectSidebar({
  projectId,
  projectName,
  projectGenre,
  projectStyle,
  currentPath,
  progress,
  onExport,
  exportDisabled,
  exportDisabledTitle,
}: ProjectSidebarProps) {
  // 分析任务状态查询
  const { data: pendingAnalyses } = trpc.analysis.listByProject.useQuery(
    { projectId, limit: 10 },
    { refetchInterval: 30000 },
  );
  const activeAnalyses = pendingAnalyses?.filter(a => a.status === 'processing') || [];
  const completedUnreadAnalyses = pendingAnalyses?.filter(a => a.status === 'completed' && !a.dismissed) || [];

  return (
    <aside className="w-56 bg-white border-r border-gray-200 p-4 flex flex-col shrink-0 sticky top-0 h-screen overflow-y-auto">
      <div className="mb-6">
        <Link href="/dashboard" className="text-xs text-gray-400 hover:text-gray-600 transition">&larr; 项目列表</Link>
        <h2 className="font-bold mt-2 truncate">{projectName}</h2>
        <p className="text-xs text-gray-500">
          {[projectGenre, projectStyle].filter(Boolean).join(' · ') || '未分类'}
        </p>
      </div>
      <nav className="space-y-1 flex-1">
        {SIDEBAR_ITEMS.map((item) => {
          const active = currentPath === item.href;
          const isNext = item.isNext?.(progress);
          const href = `/project/${projectId}${item.href}`;

          return (
            <Link
              key={item.label}
              href={href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                active
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              } ${isNext ? 'animate-cta-pulse' : ''}`}
            >
              <span className={active ? 'text-white' : 'text-gray-400'}>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {isNext && (
                <span className="text-amber-500 text-[10px] font-medium animate-pulse" title="下一步">
                  →
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* 导出作品按钮 */}
      <div className="mt-auto pt-3 border-t border-gray-200">
        {onExport ? (
          <button
            onClick={() => !exportDisabled && onExport()}
            disabled={exportDisabled}
            title={exportDisabled ? (exportDisabledTitle || '不可导出') : '导出作品'}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
              exportDisabled
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span className="text-gray-400">↓</span>
            <span>导出作品</span>
          </button>
        ) : (
          <Link
            href={`/project/${projectId}/outline?export=1`}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition"
          >
            <span className="text-gray-400">↓</span>
            <span>导出作品</span>
          </Link>
        )}
      </div>

      {/* 分析任务状态指示器 */}
      {(activeAnalyses.length > 0 || completedUnreadAnalyses.length > 0) && (
        <div className="border-t border-gray-200 pt-3 mt-2 space-y-1">
          {activeAnalyses.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-amber-700 bg-amber-50 rounded-lg">
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse shrink-0" />
              <span>AI 分析进行中 ({activeAnalyses.length})</span>
            </div>
          )}
          {completedUnreadAnalyses.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-green-700 bg-green-50 rounded-lg">
              <span className="font-bold text-green-600 shrink-0">&#10003;</span>
              <span>有新的分析报告 ({completedUnreadAnalyses.length})</span>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
