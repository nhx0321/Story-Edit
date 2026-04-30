'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

const DOCS: Record<string, { title: string; sections: { heading: string; steps: string[] }[] }> = {
  longcat: {
    title: 'LongCat API 接入指南',
    sections: [
      {
        heading: '注册与申请',
        steps: [
          '访问 longcat.chat 注册账号',
          '进入「API广场」，点击「申请更多额度」',
          '填写简单问题后即可获得每日 5000 万 token 免费额度',
          '在 API 管理页面创建 API Key',
        ],
      },
      {
        heading: '配置信息',
        steps: [
          'API 地址: https://api.longcat.chat/anthropic',
          '默认模型: LongCat-Flash-Thinking-2601',
          '支持 Anthropic 兼容协议',
        ],
      },
    ],
  },
  deepseek: {
    title: 'DeepSeek API 接入指南',
    sections: [
      {
        heading: '注册与充值',
        steps: [
          '访问 https://platform.deepseek.com/ 注册账号',
          '在控制台完成实名认证和充值',
          '进入「API Keys」页面创建新的 API Key',
        ],
      },
      {
        heading: '配置信息',
        steps: [
          'API 地址: https://api.deepseek.com/v1',
          '默认模型: deepseek-v4-pro（V4旗舰版，推荐）',
          '备选模型: deepseek-v4-flash（轻量快速版）',
          '支持 OpenAI 兼容协议',
        ],
      },
    ],
  },
  qwen: {
    title: '通义千问 API 接入指南',
    sections: [
      {
        heading: '注册与开通',
        steps: [
          '访问 https://bailian.console.aliyun.com/ 登录阿里云账号',
          '在百炼控制台开通模型服务并充值',
          '进入「API-KEY管理」页面创建 API Key',
        ],
      },
      {
        heading: '配置信息',
        steps: [
          'API 地址: https://dashscope.aliyuncs.com/apps/anthropic',
          '默认模型: qwen3.6-plus',
          '支持 Anthropic 兼容协议',
        ],
      },
    ],
  },
  custom: {
    title: '自定义 API 接入指南',
    sections: [
      {
        heading: '任意 OpenAI 兼容 API',
        steps: [
          '确保你的 API 服务支持 OpenAI 兼容协议',
          '在 AI 配置页面选择「自定义」',
          '填写 API 地址（如 http://localhost:8080/v1）',
          '填写 API Key 和模型名称',
          '点击「测试」验证连接',
        ],
      },
    ],
  },
};

export default function AIDocsPage() {
  const params = useParams();
  const provider = params.provider as string;
  const doc = DOCS[provider];

  if (!doc) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto">
          <Link href="/ai-config" className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回 AI 配置</Link>
          <div className="mt-8 text-center text-gray-400">暂无文档</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <Link href="/ai-config" className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回 AI 配置</Link>
        <h1 className="text-2xl font-bold mt-4 mb-8">{doc.title}</h1>

        <div className="space-y-8">
          {doc.sections.map(section => (
            <div key={section.heading} className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold mb-4">{section.heading}</h2>
              <ol className="space-y-3">
                {section.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-gray-600">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
