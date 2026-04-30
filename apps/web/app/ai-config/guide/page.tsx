'use client';

import Link from 'next/link';

export default function AIGuidePage() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">使用指南</h1>
      <p className="text-gray-500 text-sm mb-6">平台 AI 模型使用说明</p>

      {/* 核心提示 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6 mb-6">
        <h2 className="font-semibold text-blue-900 mb-3">平台已全面内置 AI 模型</h2>
        <p className="text-sm text-blue-800 mb-4">
          无需自行配置 API Key。平台已内置 DeepSeek、通义千问、LongCat 等主流模型，
          注册即赠送免费额度（500万 Token），其中 LongCat 免费开放；DeepSeek、通义千问等收费模型仅对付费用户开放。
        </p>
        <Link href="/ai-config"
          className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">
          前往模型广场
        </Link>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold mb-4">快速开始</h3>
          <ol className="space-y-4 text-sm">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">1</span>
              <div>
                <p className="font-medium">查看可用模型</p>
                <p className="text-gray-500">在<a href="/ai-config" className="text-blue-600 hover:underline">模型广场</a>查看所有可用模型及其价格</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">2</span>
              <div>
                <p className="font-medium">选择默认模型</p>
                <p className="text-gray-500">
                  在<a href="/ai-config" className="text-blue-600 hover:underline">模型广场</a>页面点击模型即可设为默认。
                  免费用户仅可使用 LongCat 免费模型；免费模型每日可用 100,000 Token。充值成为付费用户后，可继续使用免费模型每日 300,000 Token 限额；切换到 DeepSeek、通义千问等收费模型时不受该免费限额影响。
                  注册即赠送 500 万 Token 免费额度。
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">3</span>
              <div>
                <p className="font-medium">开始创作</p>
                <p className="text-gray-500">
                  在项目工作台中，直接开始 AI 辅助创作。费用按实际 Token 消耗自动扣除。
                </p>
              </div>
            </li>
          </ol>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold mb-4">计费说明</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <span className="text-green-600 mt-0.5">•</span>
              <div>
                <p className="font-medium">免费模型</p>
                <p className="text-gray-500">LongCat 系列模型免费开放；免费用户每日可用 100,000 Token，付费用户使用免费模型时每日可用 300,000 Token</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-blue-600 mt-0.5">•</span>
              <div>
                <p className="font-medium">付费模型</p>
                <p className="text-gray-500">DeepSeek、通义千问等模型按 Token 用量计费，仅对付费用户开放，且使用收费模型时不受免费模型日限额影响，价格见<a href="/ai-config" className="text-blue-600 hover:underline">模型广场</a></p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-amber-600 mt-0.5">•</span>
              <div>
                <p className="font-medium">Token 计算</p>
                <p className="text-gray-500">1 个汉字约等于 2 个 Token，1 个英文单词约等于 1.5 个 Token</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold mb-4">用量统计</h3>
          <p className="text-sm text-gray-500 mb-4">
            查看 AI 模型使用量和 Token 消耗。
          </p>
          <div className="flex gap-2">
            <Link href="/ai-config/consumption"
              className="inline-block px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
              站内用量统计
            </Link>
            <Link href="/ai-config/usage"
              className="inline-block px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
              站外用量统计
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
