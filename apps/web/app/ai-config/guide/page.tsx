'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

const providerGuides = [
  { id: 'longcat', name: 'LongCat', color: 'emerald' },
  { id: 'deepseek', name: 'DeepSeek', color: 'blue' },
  { id: 'qwen', name: '通义千问', color: 'amber' },
  { id: 'custom', name: '自定义 OpenAI 兼容', color: 'gray' },
];

export default function AIGuidePage() {
  const [activeProvider, setActiveProvider] = useState('longcat');
  const { data: guides, isLoading } = trpc.admin.listPresets.useQuery({
    category: 'ai_config_guide',
  });

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/ai-config" className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回AI配置</Link>
            <h1 className="text-2xl font-bold mt-4 mb-1">AI 接入完整指南</h1>
            <p className="text-gray-500 text-sm">详细的操作步骤和常见问题解答</p>
          </div>
        </div>

        {/* 快速接入指引（高亮提示） */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6 mb-6">
          <h2 className="font-semibold text-blue-900 mb-3">快速指引</h2>
          <p className="text-sm text-blue-800 mb-4">选择一个模型供应商，按照下方步骤完成 API Key 获取和配置。</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {providerGuides.map(p => (
              <button key={p.id}
                onClick={() => setActiveProvider(p.id)}
                className={`p-3 rounded-lg border text-sm font-medium transition ${
                  activeProvider === p.id
                    ? 'bg-white border-blue-400 text-blue-800 shadow-sm'
                    : 'bg-white/60 border-transparent hover:border-blue-300'
                }`}>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* 各供应商接入步骤 */}
        {activeProvider === 'longcat' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4">LongCat 接入步骤</h3>
            <ol className="space-y-4 text-sm">
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                <div>
                  <p className="font-medium">注册账号</p>
                  <p className="text-gray-500">访问 <code className="bg-gray-100 px-1 rounded">longcat.chat</code> 完成注册</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                <div>
                  <p className="font-medium">申请免费额度</p>
                  <p className="text-gray-500">进入「API广场」，点击「申请更多额度」，填写简单问题后即可获得每日 5000 万 token 免费额度</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                <div>
                  <p className="font-medium">创建 API Key</p>
                  <p className="text-gray-500">在 API 管理页面创建新的 API Key</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">4</span>
                <div>
                  <p className="font-medium">在平台配置</p>
                  <p className="text-gray-500">回到 AI 配置页面，添加 LongCat 模型，粘贴 API Key，API 地址和模型已自动填充</p>
                </div>
              </li>
            </ol>
          </div>
        )}

        {activeProvider === 'deepseek' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4">DeepSeek 接入步骤</h3>
            <ol className="space-y-4 text-sm">
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                <div>
                  <p className="font-medium">注册并实名认证</p>
                  <p className="text-gray-500">访问 <code className="bg-gray-100 px-1 rounded">https://platform.deepseek.com/</code> 注册账号并完成实名认证</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                <div>
                  <p className="font-medium">充值</p>
                  <p className="text-gray-500">在控制台完成账户充值（首次充值通常有赠送）</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                <div>
                  <p className="font-medium">创建 API Key</p>
                  <p className="text-gray-500">进入「API Keys」页面创建新的 API Key</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">4</span>
                <div>
                  <p className="font-medium">在平台配置</p>
                  <p className="text-gray-500">回到 AI 配置页面，添加 DeepSeek 模型，粘贴 API Key</p>
                </div>
              </li>
            </ol>
          </div>
        )}

        {activeProvider === 'qwen' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4">通义千问 接入步骤</h3>
            <ol className="space-y-4 text-sm">
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                <div>
                  <p className="font-medium">开通服务</p>
                  <p className="text-gray-500">访问 <code className="bg-gray-100 px-1 rounded">https://bailian.console.aliyun.com/</code> 登录阿里云账号</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                <div>
                  <p className="font-medium">开通模型服务并充值</p>
                  <p className="text-gray-500">在百炼控制台开通模型服务并完成充值</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                <div>
                  <p className="font-medium">创建 API Key</p>
                  <p className="text-gray-500">进入「API-KEY管理」页面创建 API Key</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold shrink-0">4</span>
                <div>
                  <p className="font-medium">在平台配置</p>
                  <p className="text-gray-500">回到 AI 配置页面，添加通义千问模型，粘贴 API Key</p>
                </div>
              </li>
            </ol>
          </div>
        )}

        {activeProvider === 'custom' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4">自定义 OpenAI 兼容模型 接入步骤</h3>
            <ol className="space-y-4 text-sm">
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                <div>
                  <p className="font-medium">确认 API 兼容性</p>
                  <p className="text-gray-500">确保您的 API 服务兼容 OpenAI 接口格式</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                <div>
                  <p className="font-medium">获取 API 信息</p>
                  <p className="text-gray-500">获取 API 地址（Base URL）、API Key 和模型名称</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                <div>
                  <p className="font-medium">在平台配置</p>
                  <p className="text-gray-500">回到 AI 配置页面，选择「自定义」，填写所有字段</p>
                </div>
              </li>
            </ol>
          </div>
        )}

        {/* 管理员配置的完整指南内容 */}
        {!isLoading && guides && guides.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="font-semibold text-lg mb-4">补充指南（管理员配置）</h2>
            <div className="space-y-4">
              {guides.map((g: any) => (
                <div key={g.id} className="border border-gray-100 rounded-lg p-4">
                  <h3 className="font-medium mb-2">{g.title}</h3>
                  {g.description && <p className="text-sm text-gray-500 mb-2">{g.description}</p>}
                  <pre className="whitespace-pre-wrap text-sm text-gray-600 bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                    {g.content}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 操作截图区域（管理员可通过后台配置） */}
        <div className="bg-gray-100 rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500 font-medium mb-2">操作截图</p>
          <p className="text-sm text-gray-400">管理员可在后台「预设管理 → AI配置完整指南」中添加截图和详细说明</p>
        </div>
      </div>
    </main>
  );
}
