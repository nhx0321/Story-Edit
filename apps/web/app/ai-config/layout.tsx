'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

const NAV_SECTIONS = [
  {
    title: '模型广场',
    items: [
      { href: '/ai-config', label: '模型列表', icon: '🤖' },
      { href: '/ai-config/recharge', label: '充值购买', icon: '🛒' },
      { href: '/ai-config/tokens', label: '免费 Token 用量', icon: '💰' },
      { href: '/ai-config/consumption', label: '站内用量统计', icon: '📋' },
    ],
  },
  {
    title: '开发者',
    items: [
      { href: '/ai-config/api-keys', label: 'API Keys（站外接入）', icon: '🔑' },
      { href: '/ai-config/usage', label: '站外用量统计', icon: '📊' },
    ],
  },
];

export default function AIConfigLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: account } = trpc.token.getAccount.useQuery(undefined, { enabled: true });

  const freeDailyLimit = account?.freeDailyLimit ?? account?.dailyLimit ?? 100_000;
  const freeModelDailyUsed = account?.freeDailyUsed ?? account?.dailyUsed ?? 0;
  const freeDailyRemaining = account?.freeDailyRemaining ?? Math.max(freeDailyLimit - freeModelDailyUsed, 0);
  const hasUnlimitedFreeDailyLimit = account?.hasUnlimitedFreeDailyLimit ?? freeDailyLimit === 0;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left Navigation */}
      <aside className="w-56 bg-white border-r border-gray-200 p-4 flex flex-col shrink-0">
        <div className="mb-6">
          <Link href="/dashboard" className="text-xs text-gray-400 hover:text-gray-600 transition">&larr; 返回工作台</Link>
          <h2 className="font-bold mt-2 text-base">AI 配置</h2>
        </div>

        {/* 免费 Token 用量小卡片 */}
        {account && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500">剩余免费 Token 用量</p>
            <p className="text-lg font-bold text-gray-900">{hasUnlimitedFreeDailyLimit ? '不限额' : freeDailyRemaining.toLocaleString()}</p>
            <p className="text-[11px] text-gray-400 mt-1">
              {hasUnlimitedFreeDailyLimit
                ? '免费模型不受日限额限制'
                : `已用 ${freeModelDailyUsed.toLocaleString()} / ${freeDailyLimit.toLocaleString()}`}
            </p>
          </div>
        )}

        <nav className="space-y-4 flex-1">
          {NAV_SECTIONS.map(section => (
            <div key={section.title}>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1 px-3">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map(item => {
                  const isActive = pathname === item.href || (item.href !== '/ai-config' && pathname?.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                        isActive
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        {children}
      </main>
    </div>
  );
}
