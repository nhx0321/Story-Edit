'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';

function formatPrice(pricePer1m: number): string {
  if (pricePer1m === 0) return '免费';
  return `¥${(pricePer1m / 100).toFixed(2)}/百万Token`;
}

export default function AIConfigPage() {
  const utils = trpc.useUtils();
  const { data: models = [] } = trpc.token.getAllModels.useQuery();
  const { data: account } = trpc.token.getAccount.useQuery();
  const { data: preferred } = trpc.token.getPreferredModel.useQuery();
  const setPreferred = trpc.token.setPreferredModel.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.token.getPreferredModel.invalidate(),
        utils.token.getAllModels.invalidate(),
      ]);
    },
  });

  const balance = account?.balance ?? 0;
  const accountRole = account?.role ?? 'free';
  const roleLabel = accountRole === 'admin'
    ? '管理员'
    : accountRole === 'paid'
      ? '付费用户'
      : accountRole === 'tester'
        ? '测试用户'
        : '免费用户';
  const freeDailyLimit = account?.freeDailyLimit ?? account?.dailyLimit ?? 100_000;
  const freeModelDailyUsed = account?.freeDailyUsed ?? account?.dailyUsed ?? 0;
  const freeDailyRemaining = account?.freeDailyRemaining ?? Math.max(freeDailyLimit - freeModelDailyUsed, 0);
  const hasUnlimitedFreeDailyLimit = account?.hasUnlimitedFreeDailyLimit ?? freeDailyLimit === 0;
  const DEFAULT_MODEL = 'longcat/LongCat-Flash-Thinking-2601';
  const selectedModelId = preferred?.preferredModel || DEFAULT_MODEL;

  const isModelFree = (m: { inputPricePer1m: number; outputPricePer1m: number }) =>
    m.inputPricePer1m === 0 && m.outputPricePer1m === 0;

  const hasLockedPaidModels = models.some((m: any) => !m.canAccess && !isModelFree(m));

  const isModelPremium = (m: { groupName?: string }) => m.groupName === 'premium';

  const handleSelectModel = (modelKey: string, canAccess: boolean) => {
    if (!canAccess) return;
    setPreferred.mutate({ modelId: selectedModelId === modelKey ? null : modelKey });
  };

  // 按 provider 分组
  const modelGroups: Record<string, typeof models> = {};
  for (const m of models) {
    if (!modelGroups[m.provider]) modelGroups[m.provider] = [];
    modelGroups[m.provider].push(m);
  }

  const providerInfo: Record<string, { name: string; color: string }> = {
    longcat: { name: 'LongCat', color: 'border-emerald-300' },
    deepseek: { name: 'DeepSeek', color: 'border-blue-300' },
    qwen: { name: '通义千问', color: 'border-amber-300' },
    openai: { name: 'OpenAI', color: 'border-gray-300' },
    anthropic: { name: 'Anthropic', color: 'border-purple-300' },
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* 余额概览 */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-6 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-300 mb-1">剩余免费 Token 用量</p>
            <p className="text-3xl font-bold">{hasUnlimitedFreeDailyLimit ? '不限额' : freeDailyRemaining.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">
              {hasUnlimitedFreeDailyLimit
                ? `当前分组：${roleLabel}，免费模型不受日限额限制`
                : `当前分组：${roleLabel}，已用 ${freeModelDailyUsed.toLocaleString()} / ${freeDailyLimit.toLocaleString()} Token`}
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/ai-config/consumption"
              className="px-4 py-2 bg-white/10 text-white text-sm font-medium rounded-lg hover:bg-white/20 transition">
              站内用量统计
            </Link>
            <Link href="/ai-config/recharge"
              className="px-4 py-2 bg-white text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-100 transition">
              充值
            </Link>
          </div>
        </div>
      </div>

      {/* 当前选择模型 */}
      {selectedModelId ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-500 mb-0.5">当前使用模型</p>
              <p className="font-bold text-blue-900">{selectedModelId}</p>
            </div>
            <p className="text-xs text-blue-600">点击下方模型可切换</p>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-amber-500 shrink-0">⚠</span>
            <div>
              <p className="font-medium text-amber-900">尚未选择模型</p>
              <p className="text-sm text-amber-700 mt-1">
                点击下方模型将其设为默认使用模型。{hasLockedPaidModels ? '当前账号仅可使用 LongCat 免费模型。' : balance <= 0 ? '当前余额为 0，仅可使用免费模型。' : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 非付费提示 */}
      {hasLockedPaidModels && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-amber-800">
              当前账号仅可使用 LongCat 免费模型。DeepSeek、通义千问等收费模型仅对付费用户开放。
            </p>
            <Link href="/ai-config/recharge"
              className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition shrink-0">
              去充值
            </Link>
          </div>
        </div>
      )}

      {/* 免费额度已用完提示 */}
      {!hasUnlimitedFreeDailyLimit && freeDailyRemaining <= 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <span className="text-red-500 shrink-0">ℹ</span>
              <p className="text-sm text-red-700">今日免费 Token 已用完，当前仅可继续使用已充值解锁的收费模型，或等待次日免费额度重置。</p>
            </div>
            <Link href="/ai-config/recharge"
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition shrink-0 ml-4">
              去充值
            </Link>
          </div>
        </div>
      )}

      {/* 模型广场 */}
      <h2 className="text-xl font-bold mb-4">选择模型</h2>

      <div className="space-y-4">
        {Object.entries(modelGroups).map(([provider, providerModels]) => {
          const info = providerInfo[provider] || { name: provider, color: 'border-gray-300' };
          const allFree = providerModels.every(m => isModelFree(m));
          return (
            <div key={provider} className={`bg-white rounded-xl border-2 ${info.color} overflow-hidden`}>
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900">{info.name}</h3>
                    {allFree && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                        免费
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {providerModels.map((m: any) => {
                  const modelKey = `${m.provider}/${m.modelId}`;
                  const isSelected = selectedModelId === modelKey;
                  const mFree = isModelFree(m);
                  const mPremium = isModelPremium(m);
                  const mDisabled = !m.canAccess;
                  return (
                    <div
                      key={m.id}
                      onClick={() => !mDisabled && handleSelectModel(modelKey, !mDisabled)}
                      className={`px-5 py-4 flex items-center justify-between transition ${
                        mDisabled
                          ? 'cursor-not-allowed opacity-60'
                          : isSelected
                            ? 'bg-gray-50 ring-2 ring-inset ring-gray-900 cursor-pointer'
                            : 'hover:bg-gray-50 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          mDisabled
                            ? 'border-gray-200'
                            : isSelected
                              ? 'border-gray-900'
                              : 'border-gray-300'
                        }`}>
                          {isSelected && <div className="w-2 h-2 rounded-full bg-gray-900" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`font-medium text-sm ${mDisabled ? 'text-gray-400' : 'text-gray-900'}`}>{m.modelName || m.modelId}</p>
                            {mFree && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">免费</span>
                            )}
                            {mPremium && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">付费</span>
                            )}
                            {mDisabled && (
                              <span className="text-xs text-red-500">仅付费用户可用</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 font-mono">{m.modelId}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm ${mDisabled ? 'text-gray-400' : 'text-gray-700'}`}>
                          输入 {formatPrice(m.inputPricePer1m)} / 输出 {formatPrice(m.outputPricePer1m)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {models.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          暂无可用模型，请联系管理员配置
        </div>
      )}

      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500 mb-3">需要将 AI 能力接入你的应用？</p>
        <Link href="/ai-config/api-keys"
          className="inline-block px-5 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
          创建 API Key（站外接入）
        </Link>
      </div>
    </div>
  );
}
