'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

const sections = [
  { href: '/settings/profile', title: '个人信息', desc: '头像、昵称、邮箱、密码' },
  { href: '/settings/billing', title: '充值与账单', desc: '每日签到、账户充值、我的精灵豆、邀请好友、账单记录' },
];

export default function SettingsPage() {
  const { data: checkinStatus } = trpc.userAccount.getCheckinStatus.useQuery();
  const checkinMutation = trpc.userAccount.checkin.useMutation();
  const utils = trpc.useUtils();

  const [checkingIn, setCheckingIn] = useState(false);

  const handleCheckin = async () => {
    setCheckingIn(true);
    try {
      await checkinMutation.mutateAsync();
      await utils.userAccount.getCheckinStatus.invalidate();
    } catch (e: any) {
      alert(e.message || '签到失败');
    }
    setCheckingIn(false);
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-8">设置</h1>

        {/* 签到卡片 */}
        {checkinStatus && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5 mb-6 flex items-center justify-between">
            <div>
              <p className="font-medium text-blue-900">每日签到</p>
              <p className="text-sm text-blue-700 mt-0.5">
                连续签到 {checkinStatus.streak} 天，每日获得 10 精灵豆
              </p>
            </div>
            <button onClick={handleCheckin} disabled={checkinStatus.checkedToday || checkingIn}
              className={`px-6 py-2 rounded-lg font-medium transition ${
                checkinStatus.checkedToday
                  ? 'border border-blue-300 text-blue-400 cursor-default'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}>
              {checkinStatus.checkedToday ? '今日已签到' : checkingIn ? '签到中...' : '签到'}
            </button>
          </div>
        )}

        <div className="space-y-3">
          {sections.map(s => (
            <Link
              key={s.href}
              href={s.href}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-400 transition"
            >
              <h2 className="font-semibold text-gray-900">{s.title}</h2>
              <p className="text-sm text-gray-500 mt-1">{s.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
