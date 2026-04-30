'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

export default function BillingPage() {
  const [inviteCodeInput, setInviteCodeInput] = useState('');

  const { data: profile } = trpc.userAccount.getProfile.useQuery();
  const getInviteCodeMutation = trpc.userAccount.getInviteCode.useMutation();
  const [myCode, setMyCode] = useState('');
  const [loadingInvite, setLoadingInvite] = useState(false);

  const { data: checkinStatus } = trpc.userAccount.getCheckinStatus.useQuery();
  const { data: beanData } = trpc.spriteBean.getBalance.useQuery();
  const { data: tokenAccount } = trpc.token.getAccount.useQuery();

  const utils = trpc.useUtils();
  const useCodeMutation = trpc.userAccount.useInviteCode.useMutation();
  const checkinMutation = trpc.userAccount.checkin.useMutation();
  const exchangeToBeansMutation = trpc.spriteBean.exchangeBalanceToBeans.useMutation({
    onSuccess: () => { utils.spriteBean.getBalance.invalidate(); utils.token.getAccount.invalidate(); },
  });
  const exchangeToBalanceMutation = trpc.spriteBean.exchangeBeansToBalance.useMutation({
    onSuccess: () => { utils.spriteBean.getBalance.invalidate(); utils.token.getAccount.invalidate(); },
  });

  // 兑换表单
  const [exchangeYuan, setExchangeYuan] = useState(1);
  const [exchangeBeans, setExchangeBeans] = useState(1);

  const beanBalance = beanData?.beanBalance ?? 0;
  const totalBeanSpent = beanData?.totalBeanSpent ?? 0;
  const totalXp = beanData?.totalXp ?? totalBeanSpent;

  const fetchInviteCode = useCallback(async () => {
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
  }, [profile?.inviteCode, getInviteCodeMutation]);

  useEffect(() => {
    if (!myCode && !loadingInvite && profile) {
      fetchInviteCode();
    }
  }, [myCode, loadingInvite, profile, fetchInviteCode]);

  const handleCheckin = async () => {
    try {
      await checkinMutation.mutateAsync();
      await Promise.all([
        utils.userAccount.getCheckinStatus.invalidate(),
        utils.spriteBean.getBalance.invalidate(),
      ]);
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
      await Promise.all([
        utils.userAccount.getProfile.invalidate(),
        utils.spriteBean.getBalance.invalidate(),
      ]);
      alert('邀请成功！双方各获得 30 精灵豆');
    } catch (e: any) {
      alert(e.message || '邀请码无效');
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回设置</Link>
        <h1 className="text-2xl font-bold mt-4 mb-8">精灵豆与签到</h1>

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

        {/* 2. 精灵豆余额 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold mb-4">精灵豆余额</h2>
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-5">
            <p className="text-sm text-green-600 mb-1">精灵豆余额</p>
            <p className="text-3xl font-bold text-green-800">{beanBalance}</p>
            <p className="text-xs text-green-500 mt-2">累计消耗：{totalBeanSpent} 豆 · 精灵经验：{totalXp}</p>
            <p className="text-xs text-green-400 mt-1">精灵豆可用于购买模板：1豆查看全文，10豆导入模板</p>
          </div>
        </div>

        {/* 2.5 余额与精灵豆兑换 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold mb-4">余额与精灵豆兑换</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 余额→精灵豆 */}
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
              <p className="text-sm font-medium text-blue-800 mb-1">余额 → 精灵豆</p>
              <p className="text-xs text-blue-600 mb-3">1 元 → 100 精灵豆</p>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-500 shrink-0">兑换金额（元）</span>
                <input type="number" min={1} max={10000} value={exchangeYuan}
                  onChange={e => setExchangeYuan(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 px-2 py-1.5 border border-blue-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <p className="text-xs text-gray-500 mb-3">
                将获得 <span className="font-bold text-blue-700">{exchangeYuan * 100}</span> 精灵豆，
                扣除余额 <span className="font-bold">{exchangeYuan}</span> 元
                {tokenAccount ? <span className="text-gray-400">（当前余额 ¥{((tokenAccount.balance ?? 0) / 10_000_000).toFixed(2)}）</span> : null}
              </p>
              <button
                onClick={async () => {
                  if (!confirm(`确认用 ${exchangeYuan} 元余额兑换 ${exchangeYuan * 100} 精灵豆？`)) return;
                  try {
                    const res = await exchangeToBeansMutation.mutateAsync({ amountYuan: exchangeYuan });
                    alert(`兑换成功！获得 ${res.beanAmount} 精灵豆`);
                  } catch (e: any) { alert(e.message || '兑换失败'); }
                }}
                disabled={exchangeToBeansMutation.isPending}
                className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
                {exchangeToBeansMutation.isPending ? '兑换中...' : '余额兑换精灵豆'}
              </button>
            </div>

            {/* 精灵豆→余额 */}
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <p className="text-sm font-medium text-amber-800 mb-1">精灵豆 → 余额</p>
              <p className="text-xs text-amber-600 mb-3">100 精灵豆 → 1 元</p>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-500 shrink-0">兑换精灵豆数量</span>
                <input type="number" min={1} step={1} value={exchangeBeans}
                  onChange={e => setExchangeBeans(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 px-2 py-1.5 border border-amber-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <p className="text-xs text-gray-500 mb-3">
                将获得余额 <span className="font-bold text-amber-700">{(exchangeBeans / 100).toFixed(2)}</span> 元，
                扣除 <span className="font-bold">{exchangeBeans}</span> 精灵豆
                <span className="text-gray-400">（当前 {beanBalance} 豆）</span>
              </p>
              <button
                onClick={async () => {
                  if (!confirm(`确认用 ${exchangeBeans} 精灵豆兑换 ${(exchangeBeans / 100).toFixed(2)} 元余额？`)) return;
                  try {
                    await exchangeToBalanceMutation.mutateAsync({ beanAmount: exchangeBeans });
                    alert(`兑换成功！获得余额 ${(exchangeBeans / 100).toFixed(2)} 元`);
                  } catch (e: any) { alert(e.message || '兑换失败'); }
                }}
                disabled={exchangeToBalanceMutation.isPending}
                className="w-full py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition disabled:opacity-50">
                {exchangeToBalanceMutation.isPending ? '兑换中...' : '精灵豆兑换余额'}
              </button>
            </div>
          </div>
        </div>

        {/* 3. 如何获取精灵豆 */}
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
              <span className="font-medium text-green-600">+30 豆</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span>🔄 余额兑换（1元 = 100豆）</span>
              <span className="font-medium text-green-600">按需兑换</span>
            </div>
          </div>
        </div>

        {/* 4. 邀请好友 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
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
            <p className="text-xs text-gray-500">你和好友各可获得 30 精灵豆</p>

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
      </div>
    </main>
  );
}
