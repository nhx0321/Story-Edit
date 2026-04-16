'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { trpc } from '@/lib/trpc';

const NAV_ITEMS = [
  { href: '/dashboard', label: '主页' },
  { href: '/marketplace', label: '模板广场' },
  { href: '/sprite-shop', label: '精灵商城' },
  { href: '/ai-config', label: 'AI配置' },
  { href: '/settings', label: '设置' },
];

export function Navbar() {
  const pathname = usePathname();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const isAdmin = useAuthStore(s => s.isAdmin());
  const [accountOpen, setAccountOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: me } = trpc.userAccount.getProfile.useQuery(undefined, { enabled: !!user });

  // 精灵状态（仅已孵化用户）
  const { data: spriteStatus } = trpc.sprite.getStatus.useQuery(undefined, {
    enabled: !!user,
    refetchOnWindowFocus: false,
  });
  const s = spriteStatus as any;
  const isHatched = s?.hasSprite && s?.isHatched;

  // 兑换对话框
  const [showConvertDialog, setShowConvertDialog] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
  const hideNavbar = mounted && (pathname === '/login' || pathname === '/register' || pathname === '/');
  if (hideNavbar) return null;

  const convertibleDays = (spriteStatus as any)?.convertibleDays ?? 0;
  const totalBeanSpent = s?.totalBeanSpent ?? 0;
  const spriteLevel = s?.level ?? 0;
  const beansForNextVip = 100 - (totalBeanSpent % 100);

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm" data-guide-target="navbar" suppressHydrationWarning>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-bold text-lg text-gray-900">Story Edit</Link>
            <div className="flex items-center gap-1">
              {NAV_ITEMS.map(item => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <Link key={item.href} href={item.href}
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
                <Link href="/admin/review"
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                    pathname?.startsWith('/admin')
                      ? 'bg-gray-900 text-white'
                      : 'text-amber-600 hover:text-amber-800 hover:bg-amber-50'
                  }`}>
                  管理后台
                </Link>
              )}
            </div>
          </div>

          {/* Right: Sprite Status + Account */}
          <div className="flex items-center gap-3">
            {/* 精灵状态栏 */}
            {isHatched && (
              <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 bg-gray-50 rounded-lg text-xs">
                <span className="font-medium text-gray-700">
                  {s?.customName || '精灵'} Lv.{spriteLevel}
                </span>
                <span className="text-gray-300">|</span>
                <span className="text-green-700">
                  已用: {totalBeanSpent}豆
                </span>
                <span className="text-gray-300">|</span>
                {convertibleDays > 0 ? (
                  <>
                    <span className="text-green-600 font-medium">
                      可兑换: {convertibleDays}天
                    </span>
                    <button
                      onClick={() => setShowConvertDialog(true)}
                      className="px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700 transition"
                    >
                      兑换
                    </button>
                  </>
                ) : (
                  <span className="text-gray-400">
                    再{beansForNextVip}豆兑换1天
                  </span>
                )}
              </div>
            )}

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
                  {isHatched && (
                    <Link href="/sprite-shop" onClick={() => setAccountOpen(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      精灵商城
                    </Link>
                  )}
                  <Link href="/ai-config" onClick={() => setAccountOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    AI 配置
                  </Link>
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

      {/* VIP 兑换对话框 */}
      {showConvertDialog && convertibleDays > 0 && (
        <ConvertDialog
          maxDays={convertibleDays}
          onClose={() => setShowConvertDialog(false)}
        />
      )}
    </nav>
  );
}

function ConvertDialog({ maxDays, onClose }: { maxDays: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const convertMutation = trpc.sprite.convertBeanToDays.useMutation();
  const [customDays, setCustomDays] = useState<string>('');
  const [mode, setMode] = useState<'all' | 'custom'>('all');

  const handleConvert = async () => {
    const days = mode === 'all' ? maxDays : Math.min(maxDays, parseInt(customDays) || 1);
    if (days < 1) return;

    try {
      await convertMutation.mutateAsync({ days });
      utils.sprite.getStatus.invalidate();
      onClose();
    } catch (e: any) {
      alert(e.message || '兑换失败');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl w-[360px] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">兑换 VIP 时长</h2>
        </div>

        <div className="px-6 py-6">
          <div className="mb-4">
            <p className="text-sm text-gray-500">可兑换天数</p>
            <p className="text-3xl font-bold text-green-600">{maxDays} 天</p>
          </div>

          <div className="space-y-3 mb-4">
            <button
              onClick={() => setMode('all')}
              className={`w-full px-4 py-3 rounded-lg border text-sm font-medium transition ${
                mode === 'all'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              全部兑换（{maxDays} 天）
            </button>

            <div>
              <button
                onClick={() => setMode('custom')}
                className={`w-full px-4 py-3 rounded-lg border text-sm font-medium transition ${
                  mode === 'custom'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                部分兑换
              </button>
              {mode === 'custom' && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={maxDays}
                    value={customDays}
                    onChange={e => setCustomDays(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="输入天数"
                  />
                  <span className="text-sm text-gray-500">天</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">
            取消
          </button>
          <button onClick={handleConvert}
            disabled={convertMutation.isPending || (mode === 'custom' && (!customDays || parseInt(customDays) < 1))}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition disabled:opacity-50">
            {convertMutation.isPending ? '兑换中...' : '确认兑换'}
          </button>
        </div>
      </div>
    </div>
  );
}
