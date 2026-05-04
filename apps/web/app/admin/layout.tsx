'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { trpc } from '@/lib/trpc';
import Link from 'next/link';

const navItems: Array<{ href: string; label: string; level: number | null; separator?: boolean }> = [
  { href: '/admin/templates', label: '模板广场', level: null },
  { href: '/admin/presets', label: '预设管理', level: null },
  { href: '/admin/permissions', label: '权限管理', level: 0 },
  { href: '/admin/users', label: '用户管理', level: 1 },
  { href: '/admin/feedback', label: '用户反馈', level: null },
  // --- 横线分隔 ---
  { href: '/admin/revenue', label: '营收仪表盘', level: 0, separator: true },
  { href: '/admin/pricing', label: '模型定价', level: 0 },
  { href: '/admin/channels', label: '渠道管理', level: 0 },
  { href: '/admin/migration', label: '历史迁移', level: 0 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const token = useAuthStore(state => state.token);
  const isAdmin = useAuthStore(state => state.isAdmin());
  const getAdminLevel = useAuthStore(state => state.getAdminLevel);
  const setAuth = useAuthStore(state => state.setAuth);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: hydrated && !!token,
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });

    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
    }

    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    if (!token) {
      router.replace('/login');
      return;
    }

    if (meQuery.data) {
      setAuth(token, {
        id: meQuery.data.id,
        email: meQuery.data.email,
        nickname: meQuery.data.nickname,
        isAdmin: meQuery.data.isAdmin,
        displayId: meQuery.data.displayId,
        adminLevel: meQuery.data.adminLevel,
      });
    }
  }, [hydrated, token, router, meQuery.data, setAuth]);

  useEffect(() => {
    if (!hydrated) return;
    if (meQuery.isLoading || meQuery.isFetching) return;

    if (meQuery.error) {
      if (!isAdmin) {
        router.replace('/dashboard');
      } else {
        setLoading(false);
      }
      return;
    }

    if (meQuery.data) {
      if (!meQuery.data.isAdmin) {
        router.replace('/dashboard');
      } else {
        setLoading(false);
      }
      return;
    }

    if (!isAdmin) {
      router.replace('/dashboard');
    } else {
      setLoading(false);
    }
  }, [hydrated, isAdmin, meQuery.data, meQuery.error, meQuery.isFetching, meQuery.isLoading, router]);

  if (!hydrated || loading || meQuery.isLoading || meQuery.isFetching) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">加载中...</div>
      </main>
    );
  }

  const rawAdminLevel = getAdminLevel();
  // 向后兼容：旧缓存 isAdmin=true 但 adminLevel=null，视为总管理员(level=0)
  const adminLevel = (isAdmin && rawAdminLevel === null) ? 0 : rawAdminLevel;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin Sidebar */}
      <div className="flex">
        <aside className="w-56 min-h-screen bg-white border-r border-gray-200 p-4 shrink-0">
          <h2 className="text-base font-bold text-gray-900 mb-4">管理后台</h2>
          <nav className="space-y-1">
            {navItems.map(item => {
              // Skip items requiring higher admin level
              if (item.level !== null && (adminLevel === null || adminLevel > item.level)) {
                return null;
              }
              return (
                <div key={item.href}>
                  {item.separator && (
                    <hr className="my-2 border-gray-200" />
                  )}
                  <Link
                    href={item.href}
                    className={`block px-3 py-2 rounded-lg text-sm font-medium transition ${
                      pathname?.startsWith(item.href)
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                </div>
              );
            })}
            <Link
              href="/dashboard"
              className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition"
            >
              &larr; 返回工作台
            </Link>
          </nav>
        </aside>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
