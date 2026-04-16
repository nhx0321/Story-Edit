'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { CUMULATIVE_XP } from '@/lib/sprite-config';

export default function BillingPage() {
  const [inviteCodeInput, setInviteCodeInput] = useState('');

  const { data: profile } = trpc.userAccount.getProfile.useQuery();
  const getInviteCodeMutation = trpc.userAccount.getInviteCode.useMutation();
  const [myCode, setMyCode] = useState('');
  const [loadingInvite, setLoadingInvite] = useState(false);

  const { data: checkinStatus } = trpc.userAccount.getCheckinStatus.useQuery();
  const { data: transactions } = trpc.userAccount.getTransactions.useQuery({ limit: 20 });
  const { data: status } = trpc.sprite.getStatus.useQuery();
  const { data: beanData } = trpc.spriteBean.getBalance.useQuery();
  const { data: levelProgress } = trpc.spriteBean.getLevelProgress.useQuery();

  const useCodeMutation = trpc.userAccount.useInviteCode.useMutation();
  const checkinMutation = trpc.userAccount.checkin.useMutation();

  const beanBalance = beanData?.beanBalance ?? 0;
  const totalBeanSpent = beanData?.totalBeanSpent ?? 0;
  const totalXp = beanData?.totalXp ?? totalBeanSpent;
  const convertibleDays = levelProgress?.convertibleDays ?? 0;
  const s = status as any;
  const isHatched = s?.isHatched ?? false;
  const spriteLevel = s?.level ?? 1;

  const fetchInviteCode = async () => {
    if (profile?.inviteCode) {
      setMyCode(profile.inviteCode);
      return;
    }
    setLoadingInvite(true);
    try {
      const result = await getInviteCodeMutation.mutateAsync();
      setMyCode(result.code);
    } catch (e) {
      // ignore
    }
    setLoadingInvite(false);
  };

  // Auto-fetch invite code
  useEffect(() => {
    if (!myCode && !loadingInvite && profile) {
      fetchInviteCode();
    }
  }, [myCode, loadingInvite, profile]);

  const handleCheckin = async () => {
    try {
      await checkinMutation.mutateAsync();
      await trpc.useUtils().userAccount.getCheckinStatus.invalidate();
    } catch (e: any) {
      alert(e.message || '签到失败');
    }
  };

  const handleUseCode = async () => {
    if (!inviteCodeInput.trim() || inviteCodeInput.length !== 6) {
      alert('请输入6位邀请码');
      return;
    }
    try {
      await useCodeMutation.mutateAsync({ code: inviteCodeInput });
      alert('邀请成功！双方各获得 300 精灵豆');
    } catch (e: any) {
      alert(e.message || '邀请码无效');
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回设置</Link>
        <h1 className="text-2xl font-bold mt-4 mb-8">充值与账单</h1>

        {/* 1. 每日签到 */}
        {checkinStatus && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">每日签到</h2>
                <p className="text-sm text-gray-500 mt-1">
                  连续签到 {checkinStatus.streak} 天
                </p>
                <p className="text-xs text-gray-400 mt-1">每日签到奖励：10 精灵豆</p>
              </div>
              <button onClick={handleCheckin} disabled={checkinStatus.checkedToday}
                className={`px-6 py-2 rounded-lg font-medium transition ${
                  checkinStatus.checkedToday
                    ? 'border border-gray-300 text-gray-400 cursor-default'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}>
                {checkinStatus.checkedToday ? '今日已签到' : '签到'}
              </button>
            </div>
          </div>
        )}

        {/* 2. 账户充值 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold mb-4">账户充值</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
            {[
              { amount: 500, label: '¥5' },
              { amount: 1000, label: '¥10' },
              { amount: 3000, label: '¥30' },
              { amount: 10000, label: '¥100' },
              { amount: 30000, label: '¥300' },
            ].map(opt => (
              <button key={opt.amount}
                className="py-3 border border-gray-200 rounded-lg text-center hover:border-gray-900 hover:bg-gray-50 transition font-medium"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <input type="number" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="自定义充值金额（元）" />
            <button className="px-6 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition">
              立即充值
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-3">充值获得精灵豆，可用于互动消费、道具购买、模板导入等</p>
        </div>

        {/* 3. 我的精灵豆 */}
        {isHatched && (
          <>
            {/* 精灵豆余额 */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-6 mb-6">
              <p className="text-sm text-green-600 mb-1">精灵豆余额（充值余额）</p>
              <p className="text-4xl font-bold text-green-800">{beanBalance}</p>
              <p className="text-xs text-green-500 mt-2">累计消耗：{totalBeanSpent} 豆 · 精灵经验：{totalXp}</p>
              <p className="text-xs text-green-400 mt-1">充值比例：1元 = 100豆</p>
            </div>

            {/* VIP 兑换提示 */}
            {convertibleDays > 0 && (
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-200 p-6 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-purple-600 mb-1">可兑换 VIP 时长</p>
                    <p className="text-3xl font-bold text-purple-800">{convertibleDays} 天</p>
                  </div>
                  <Link href="/sprite-shop"
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition">
                    前往兑换
                  </Link>
                </div>
              </div>
            )}

            {/* 升级进度 */}
            {levelProgress && !levelProgress.maxLevel && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h2 className="font-semibold mb-4">升级经验（L{spriteLevel} → L{spriteLevel + 1}）</h2>
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span>经验值进度</span>
                    <span className="text-gray-500">{levelProgress.xpProgress}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${getXpPercent(levelProgress.xpProgress)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">还需 {levelProgress.xpNeeded} 经验</p>
                </div>
              </div>
            )}

            {levelProgress?.maxLevel && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 text-center">
                <p className="text-lg font-semibold">🎉 已达最高等级 L9！</p>
                <p className="text-sm text-gray-500 mt-1">恭喜你的精灵已完全成长</p>
              </div>
            )}

            {/* 获取精灵豆 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
              <h2 className="font-semibold mb-4">如何获取精灵豆</h2>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center justify-between py-2 border-b border-gray-50">
                  <span>🎯 新手引导完成</span>
                  <span className="font-medium text-green-600">+100 豆</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-50">
                  <span>📅 每日签到</span>
                  <span className="font-medium text-green-600">+10 豆</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-50">
                  <span>👥 邀请好友</span>
                  <span className="font-medium text-green-600">+300 豆</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span>💰 充值（1元 = 100豆）</span>
                  <span className="font-medium text-green-600">按需充值</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 4. 邀请好友 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold mb-4">邀请好友</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-50 rounded-lg px-4 py-2.5 font-mono text-lg text-center">
                {loadingInvite ? '生成中...' : myCode || '暂未生成'}
              </div>
              <button onClick={() => navigator.clipboard?.writeText(myCode)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-500 transition">
                复制
              </button>
            </div>
            <p className="text-xs text-gray-500">你和好友各可获得 300 精灵豆</p>

            {/* 填写邀请码 */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">填写邀请码</p>
              <div className="flex gap-3">
                <input type="text" maxLength={6} value={inviteCodeInput}
                  onChange={e => setInviteCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono"
                  placeholder="6位邀请码" />
                <button onClick={handleUseCode} disabled={useCodeMutation.isPending}
                  className="px-6 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50">
                  确认
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 5. 账单记录 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold mb-4">账单记录</h2>
          {transactions && transactions.length > 0 ? (
            <div className="space-y-2">
              {transactions.map(t => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm">{t.description || t.type}</p>
                    <p className="text-xs text-gray-400">{new Date(t.createdAt).toLocaleDateString('zh-CN')}</p>
                  </div>
                  <span className={`text-sm font-medium ${t.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {t.amount >= 0 ? '+' : ''}{(t.amount / 100).toFixed(2)} 元
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">暂无账单记录</p>
          )}
        </div>
      </div>
    </main>
  );
}

function getXpPercent(progress: string): number {
  const parts = progress.split('/');
  if (parts.length !== 2) return 0;
  const current = parseInt(parts[0]);
  const total = parseInt(parts[1]);
  if (total === 0) return 0;
  return Math.min(100, (current / total) * 100);
}
