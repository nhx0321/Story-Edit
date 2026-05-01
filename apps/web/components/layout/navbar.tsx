'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { trpc } from '@/lib/trpc';
import { FeedbackDialog } from '@/components/feedback-dialog';
import { BackgroundSwitcher, MusicToggle } from '@/components/layout/background-controls';

function NavItems({ pathname, mounted, isAdmin, latestProjectId }: { pathname: string; mounted: boolean; isAdmin: boolean; latestProjectId?: string }) {
  // 如果在 /project/[id] 路径下，指向当前项目概览页
  const match = pathname.match(/^\/project\/([^/]+)/);
  const projectHref = match
    ? `/project/${match[1]}`
    : latestProjectId
      ? `/project/${latestProjectId}`
      : '/dashboard';
  const navItems = [
    { href: '/ai-config', label: 'AI 配置' },
    { href: projectHref, label: '项目', projectAware: true },
    { href: '/marketplace', label: '模板广场' },
    { href: '/settings', label: '设置' },
  ];

  return (
    <div className="flex items-center gap-1">
      {navItems.map(item => {
        const isActive = item.projectAware
          ? pathname === item.href || pathname.startsWith('/project/')
          : pathname === item.href || pathname?.startsWith(item.href + '/');
        const guideTarget = item.href === '/ai-config' ? 'ai-config' :
                           item.href === '/dashboard' || item.projectAware ? 'project-list' :
                           item.href === '/marketplace' ? 'template-list' :
                           item.href === '/settings' ? 'settings' : '';
        return (
          <Link key={item.label} href={item.href}
            data-guide-target={guideTarget}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
              isActive
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}>
            {item.label}
          </Link>
        );
      })}
      {mounted && isAdmin && (
        <Link href="/admin/templates"
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
            pathname?.startsWith('/admin')
              ? 'bg-gray-900 text-white'
              : 'text-amber-600 hover:text-amber-800 hover:bg-amber-50'
          }`}>
          管理后台
        </Link>
      )}
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const isAdmin = useAuthStore(s => s.isAdmin());
  const [accountOpen, setAccountOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: me } = trpc.userAccount.getProfile.useQuery(undefined, { enabled: !!user });

  // 项目列表（用于项目按钮指向最近项目）
  const { data: projects } = trpc.project.list.useQuery(undefined, {
    enabled: !!user,
  });
  const latestProjectId = projects && projects.length > 0
    ? projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]?.id
    : undefined;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Don't show navbar on login/register pages
  const hideNavbar = mounted && (pathname === '/login' || pathname === '/register');
  if (hideNavbar) return null;

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm" data-guide-target="navbar" suppressHydrationWarning>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-6">
            <Link href="/" className="font-bold text-lg text-gray-900">Story Edit</Link>
            <div className="flex items-center gap-1">
              <NavItems pathname={pathname} mounted={mounted} isAdmin={isAdmin} latestProjectId={latestProjectId} />
            </div>
          </div>

          {/* Right: Background controls + Account */}
          <div className="flex items-center gap-3">
            <MusicToggle />
            <BackgroundSwitcher />
            {/* Account */}
            <div className="relative" ref={ref}>
              <button onClick={() => setAccountOpen(!accountOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition">
                <span className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-sm">
                  {me?.avatarUrl || user?.nickname?.[0] || 'U'}
                </span>
                <span className="text-sm text-gray-700 max-w-[100px] truncate">
                  {user?.nickname || user?.email || '用户'}
                </span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${accountOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {accountOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg border border-gray-200 shadow-lg py-1">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900 truncate">{user?.nickname || '未设置昵称'}</p>
                    <p className="text-xs text-gray-500 truncate">{user?.email || '未绑定邮箱'}</p>
                  </div>
                  <button onClick={() => { setFeedbackOpen(true); setAccountOpen(false); }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    意见反馈
                  </button>
                  <Link href="/settings/profile" onClick={() => setAccountOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    个人信息
                  </Link>
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    <button onClick={() => { logout(); setAccountOpen(false); }}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                      退出登录
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </nav>
  );
}
