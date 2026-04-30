'use client';

import { useState } from 'react';
import Image from 'next/image';
import { trpc } from '@/lib/trpc';

// 固定充值档位 — 每个档位对应一张固定金额收款码
// 图片命名规则: /recharge/wechat_10.jpg, /recharge/alipay_50.jpg
const RECHARGE_OPTIONS = [
  { yuan: 10, label: '10元' },
  { yuan: 50, label: '50元' },
  { yuan: 100, label: '100元' },
  { yuan: 300, label: '300元' },
];

export default function AIConfigRechargePage() {
  const { data: account, refetch: refetchAccount } = trpc.token.getAccount.useQuery();
  const { data: beanData } = trpc.spriteBean.getBalance.useQuery();
  const { data: rechargeSetting } = trpc.token.getSystemSetting.useQuery({ key: 'recharge_enabled' });
  const utils = trpc.useUtils();

  const rechargeEnabled = rechargeSetting?.value !== 'false';

  const [selectedYuan, setSelectedYuan] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'wechat' | 'alipay'>('wechat');
  const [showPayment, setShowPayment] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [rechargeSuccess, setRechargeSuccess] = useState(false);

  // 兑换相关
  const [exchangeDirection, setExchangeDirection] = useState<'balance_to_bean' | 'bean_to_balance'>('balance_to_bean');
  const [exchangeAmount, setExchangeAmount] = useState('');

  const createCustomOrderMutation = trpc.token.createCustomRechargeOrder.useMutation();
  const confirmPaymentMutation = trpc.token.confirmRechargePayment.useMutation();
  const balanceToBeanMutation = trpc.spriteBean.exchangeBalanceToBeans.useMutation();
  const beanToBalanceMutation = trpc.spriteBean.exchangeBeansToBalance.useMutation();

  const toTokens = (units: number) => Math.round(units / 10_000_000 * 1_000_000);
  const balance = account?.balance ?? 0;
  const beanBalance = beanData?.beanBalance ?? 0;

  const handleBuy = (yuan: number) => {
    setSelectedYuan(yuan);
    setPaymentMethod('wechat');
    setPendingOrderId(null);
    setRechargeSuccess(false);
    setShowPayment(true);
  };

  const handleCreateOrder = async () => {
    if (!selectedYuan) return;
    try {
      const result = await createCustomOrderMutation.mutateAsync({
        amountYuan: selectedYuan,
        paymentMethod,
      });
      setPendingOrderId(result.orderId);
    } catch (e: any) {
      alert(e.message || '创建订单失败');
    }
  };

  const handleConfirmPayment = async () => {
    if (!pendingOrderId) return;
    try {
      await confirmPaymentMutation.mutateAsync({ orderId: pendingOrderId });
      setRechargeSuccess(true);
      // 立即刷新余额和充值记录
      await Promise.all([
        refetchAccount(),
        utils.token.getRechargeOrders.invalidate(),
      ]);
      setTimeout(async () => {
        setShowPayment(false);
        setPendingOrderId(null);
        setSelectedYuan(null);
        setRechargeSuccess(false);
        // 弹窗关闭后再刷新一次确保数据最新
        await refetchAccount();
      }, 2500);
    } catch (e: any) {
      alert(e.message || '确认支付失败');
    }
  };

  const handleExchange = async () => {
    const num = parseInt(exchangeAmount);
    if (!num || num <= 0) return;
    try {
      if (exchangeDirection === 'balance_to_bean') {
        await balanceToBeanMutation.mutateAsync({ amountYuan: num });
        alert(`兑换成功！获得 ${num * 100} 精灵豆`);
      } else {
        await beanToBalanceMutation.mutateAsync({ beanAmount: num });
        alert(`兑换成功！${num} 精灵豆已转为 ${(num / 100).toFixed(2)} 元余额`);
      }
      setExchangeAmount('');
      await Promise.all([
        utils.token.getAccount.invalidate(),
        utils.spriteBean.getBalance.invalidate(),
      ]);
    } catch (e: any) {
      alert(e.message || '兑换失败');
    }
  };

  const exchangeNum = parseInt(exchangeAmount) || 0;
  const exchangePreview = exchangeDirection === 'balance_to_bean'
    ? `${exchangeNum} 元 → ${exchangeNum * 100} 精灵豆`
    : `${exchangeNum} 精灵豆 → ${(exchangeNum / 100).toFixed(2)} 元`;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">充值购买</h1>

      {/* 当前余额 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">账户余额（人民币）</p>
          <p className="text-2xl font-bold text-gray-900">¥{(balance / 10_000_000).toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-1">可用于 AI 创作消耗</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">Token 余额</p>
          <p className="text-2xl font-bold text-gray-900">{toTokens(balance).toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">≈ ¥{(balance / 10_000_000).toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">精灵豆余额</p>
          <p className="text-2xl font-bold text-green-700">{beanBalance}</p>
          <p className="text-xs text-gray-400 mt-1">1豆查看模板全文，10豆导入模板</p>
        </div>
      </div>

      {/* 充值包 */}
      {!rechargeEnabled ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8 text-center">
          <p className="text-amber-700 font-medium">充值功能暂未开放</p>
          <p className="text-sm text-amber-600 mt-1">管理员已暂停充值购买功能，如需充值请联系管理员</p>
        </div>
      ) : (
      <>
      <h2 className="text-lg font-semibold mb-3">Token 充值</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {RECHARGE_OPTIONS.map(opt => (
          <button
            key={opt.yuan}
            onClick={() => handleBuy(opt.yuan)}
            className="bg-white rounded-xl border-2 border-gray-200 p-5 text-center hover:border-gray-900 transition"
          >
            <p className="text-2xl font-bold text-gray-900">¥{opt.yuan}</p>
          </button>
        ))}
      </div>
      </>
      )}

      {/* 余额↔精灵豆兑换 */}
      <h2 className="text-lg font-semibold mb-3">余额与精灵豆兑换</h2>
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <p className="text-sm text-gray-500 mb-4">汇率：1元 = 100精灵豆，双向兑换</p>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setExchangeDirection('balance_to_bean')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              exchangeDirection === 'balance_to_bean'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            余额 → 精灵豆
          </button>
          <button
            onClick={() => setExchangeDirection('bean_to_balance')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              exchangeDirection === 'bean_to_balance'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            精灵豆 → 余额
          </button>
        </div>

        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-sm text-gray-600 mb-1 block">
              {exchangeDirection === 'balance_to_bean' ? '兑换金额（元）' : '兑换精灵豆数量'}
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={exchangeAmount}
              onChange={e => setExchangeAmount(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder={exchangeDirection === 'balance_to_bean' ? '输入金额（整数，最小1元）' : '输入精灵豆数量（最小1豆）'}
            />
          </div>
          <button
            onClick={handleExchange}
            disabled={!exchangeNum || exchangeNum <= 0 || balanceToBeanMutation.isPending || beanToBalanceMutation.isPending}
            className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 shrink-0"
          >
            确认兑换
          </button>
        </div>

        {exchangeNum > 0 && (
          <p className="text-sm text-blue-600 mt-3">{exchangePreview}</p>
        )}
      </div>

      {/* 充值记录 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold mb-4">充值记录</h3>
        <RechargeOrders />
      </div>

      {/* 支付对话框 */}
      {showPayment && selectedYuan && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          onClick={() => { if (!pendingOrderId) setShowPayment(false); }}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            {rechargeSuccess ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-4">🎉</div>
                <h3 className="text-xl font-bold mb-2">充值成功！</h3>
                <p className="text-gray-500">Token 已到账</p>
              </div>
            ) : !pendingOrderId ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold">确认充值</h3>
                  <button onClick={() => setShowPayment(false)}
                    className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>
                <div className="text-center py-3 mb-4">
                  <p className="text-3xl font-bold text-gray-900">¥{selectedYuan}</p>
                </div>
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">支付方式</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setPaymentMethod('wechat')}
                      className={`py-3 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition ${
                        paymentMethod === 'wechat' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                      }`}>💚 微信</button>
                    <button onClick={() => setPaymentMethod('alipay')}
                      className={`py-3 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition ${
                        paymentMethod === 'alipay' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                      }`}>💙 支付宝</button>
                  </div>
                </div>
                <button onClick={handleCreateOrder}
                  disabled={createCustomOrderMutation.isPending}
                  className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50">
                  {createCustomOrderMutation.isPending ? '创建中...' : '生成收款码'}
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold">扫码支付</h3>
                  <button onClick={() => setPendingOrderId(null)}
                    className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>
                <div className="text-center mb-4">
                  <p className="text-sm text-gray-500">
                    请使用 {paymentMethod === 'wechat' ? '微信' : '支付宝'} 扫码支付
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">¥{selectedYuan}</p>
                </div>
                <div className="flex justify-center mb-4">
                  <div className="border-2 border-gray-200 rounded-xl p-3 bg-white">
                    <Image
                      src={`/recharge/${paymentMethod}_${selectedYuan}.jpg`}
                      alt={`${paymentMethod === 'wechat' ? '微信' : '支付宝'}收款码 ¥${selectedYuan}`}
                      width={240} height={240} className="rounded-lg"
                    />
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-amber-700">
                    请使用{paymentMethod === 'wechat' ? '微信' : '支付宝'}扫描上方固定金额收款码完成支付（金额 ¥{selectedYuan}），支付完成后点击下方按钮确认。
                  </p>
                </div>
                <button onClick={handleConfirmPayment}
                  disabled={confirmPaymentMutation.isPending}
                  className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50">
                  {confirmPaymentMutation.isPending ? '确认中...' : '我已支付'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RechargeOrders() {
  const { data: orders, isLoading } = trpc.token.getRechargeOrders.useQuery();

  if (isLoading) return <p className="text-sm text-gray-400 text-center py-4">加载中...</p>;
  if (!orders || orders.length === 0) return <p className="text-sm text-gray-400 text-center py-4">暂无充值记录</p>;

  return (
    <div className="space-y-2">
      {orders.map(o => (
        <div key={o.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
          <div>
            <p className="text-sm">
              {o.paymentMethod === 'wechat' ? '微信' : o.paymentMethod === 'alipay' ? '支付宝' : '管理员'}充值
            </p>
            <p className="text-xs text-gray-400">{new Date(o.createdAt).toLocaleString('zh-CN')}</p>
          </div>
          <div className="text-right">
            <span className="text-sm font-medium text-green-600">
              +{Math.round((o.tokenAmount ?? 0) / 10_000_000 * 1_000_000).toLocaleString()} Token
            </span>
            <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
              o.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {o.status === 'paid' ? '已支付' : '待支付'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
