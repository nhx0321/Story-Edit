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
  { href: '/templates', label: '模板', icon: '▦' },
  { href: '/agents', label: 'AI 助手', icon: '✦' },
];

interface ProjectSidebarProps {
  projectId: string;
  projectName: string;
  projectGenre?: string | null;
  projectStyle?: string | null;
  currentPath: string;
  progress: WorkflowProgress;
}

function getChapterHref(projectId: string, progress: WorkflowProgress): string {
  // 如果已有章节正文 → 指向最近的章节工作台
  if (progress.chapterDraft > 0 || progress.chapterFinal > 0) {
    // 用 progress 判断是否有正文，具体 ID 需通过附加查询
    // 此处返回通用路径，组件内会动态解析
  }
  // 有章节但无正文 → 指向大纲页提示用户先创建大纲
  return `/project/${projectId}/chapters`;
}

export function ProjectSidebar({
  projectId,
  projectName,
  projectGenre,
  projectStyle,
  currentPath,
  progress,
}: ProjectSidebarProps) {
  // 查询最近章节用于正文创作跳转
  const { data: stats } = trpc.project.getProjectStats.useQuery(
    { projectId },
    { enabled: progress.hasChapters },
  );
  const { data: outlineTree } = trpc.project.getOutlineTree.useQuery(
    { projectId },
    { enabled: progress.hasChapters && !stats?.recentChapter },
  );

  // 计算正文创作链接：recentChapter → 第一个章节 → 大纲页兜底
  const chapterHref = (() => {
    if (stats?.recentChapter) {
      return `/project/${projectId}/chapter/${stats.recentChapter.id}`;
    }
    // 从 outlineTree 找第一个章节
    if (outlineTree && outlineTree.length > 0) {
      const firstVol = outlineTree[0];
      if (firstVol?.units && firstVol.units.length > 0) {
        const firstUnit = firstVol.units[0];
        if (firstUnit?.chapters && firstUnit.chapters.length > 0) {
          return `/project/${projectId}/chapter/${firstUnit.chapters[0].id}`;
        }
      }
    }
    return `/project/${projectId}/outline`;
  })();

  return (
    <aside className="w-56 bg-white border-r border-gray-200 p-4 flex flex-col shrink-0">
      <div className="mb-6">
        <Link href="/dashboard" className="text-xs text-gray-400 hover:text-gray-600 transition">&larr; 项目列表</Link>
        <h2 className="font-bold mt-2 truncate">{projectName}</h2>
        <p className="text-xs text-gray-500">
          {[projectGenre, projectStyle].filter(Boolean).join(' · ') || '未分类'}
        </p>
      </div>
      <nav className="space-y-1 flex-1">
        {SIDEBAR_ITEMS.map(item => {
          const active = currentPath === item.href;
          const complete = item.isComplete?.(progress);
          const isNext = item.isNext?.(progress);
          // 正文创作链接动态指向工作台
          const href = item.label === '正文创作'
            ? chapterHref
            : `/project/${projectId}${item.href}`;

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
              {complete && (
                <span className="text-green-500 text-xs font-bold" title="已完成">✓</span>
              )}
              {isNext && !complete && (
                <span className="text-amber-500 text-[10px] font-medium animate-pulse" title="下一步">
                  →
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
