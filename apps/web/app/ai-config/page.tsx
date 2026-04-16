'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

const providers = [
  { id: 'longcat', name: 'LongCat', desc: '零成本上手，官方可申请每日5000万token免费额度', tag: '免费模型', tagColor: 'bg-emerald-100 text-emerald-700', docsUrl: '/ai-config/docs/longcat' },
  { id: 'deepseek', name: 'DeepSeek', desc: '高性价比，中文表现优秀，API调用付费', tag: '付费模型', tagColor: 'bg-blue-100 text-blue-700', docsUrl: '/ai-config/docs/deepseek' },
  { id: 'qwen', name: '通义千问', desc: '官网注册付费，撰写能力优质', tag: '付费模型', tagColor: 'bg-amber-100 text-amber-700', docsUrl: '/ai-config/docs/qwen' },
  { id: 'custom', name: '自定义（OpenAI兼容）', desc: '填写任意OpenAI兼容API地址', tag: '', tagColor: '', docsUrl: '/ai-config/docs/custom' },
];

// 各 provider 默认 API 地址和模型
const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  longcat: { baseUrl: 'https://api.longcat.chat/anthropic', model: 'LongCat-Flash-Thinking-2601' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic', model: 'qwen3.6-plus' },
  custom: { baseUrl: '', model: '' },
};

export default function AIConfigPage() {
  const utils = trpc.useUtils();
  const { data: configs = [] } = trpc.ai.listConfigs.useQuery();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ provider: '', apiKey: '', baseUrl: '', defaultModel: '' });
  const [testingId, setTestingId] = useState('');
  const [testResult, setTestResult] = useState<Record<string, 'success' | 'fail'>>({});
  const [testError, setTestError] = useState<Record<string, string>>({});

  const saveConfig = trpc.ai.saveConfig.useMutation({
    onSuccess: () => {
      utils.ai.listConfigs.invalidate();
      setForm({ provider: '', apiKey: '', baseUrl: '', defaultModel: '' });
      setAdding(false);
    },
  });
  const deleteConfig = trpc.ai.deleteConfig.useMutation({
    onSuccess: () => utils.ai.listConfigs.invalidate(),
  });
  const testConnection = trpc.ai.testConnection.useMutation();

  const selectProvider = (id: string) => {
    const defaults = PROVIDER_DEFAULTS[id];
    setForm(f => ({
      ...f,
      provider: id,
      baseUrl: defaults?.baseUrl || '',
      defaultModel: defaults?.model || '',
    }));
  };

  const handleAdd = () => {
    if (!form.provider || !form.apiKey) return;
    saveConfig.mutate({
      provider: form.provider as 'deepseek' | 'longcat' | 'qwen' | 'custom',
      name: providers.find(p => p.id === form.provider)?.name || form.provider,
      apiKey: form.apiKey,
      baseUrl: form.baseUrl || undefined,
      defaultModel: form.defaultModel || undefined,
    });
  };

  const handleTest = async (configId: string) => {
    setTestingId(configId);
    setTestResult(r => ({ ...r, [configId]: 'success' }));
    setTestError(r => ({ ...r, [configId]: '' }));
    try {
      const result = await testConnection.mutateAsync({ configId });
      if (result.ok) {
        setTestResult(r => ({ ...r, [configId]: 'success' }));
        setTestError(r => ({ ...r, [configId]: result.error || '未知错误' }));
      } else {
        setTestResult(r => ({ ...r, [configId]: 'fail' }));
        setTestError(r => ({ ...r, [configId]: result.error || '未知错误' }));
      }
    } catch (e: any) {
      setTestResult(r => ({ ...r, [configId]: 'fail' }));
      setTestError(r => ({ ...r, [configId]: e?.message || '请求失败' }));
    }
    setTestingId('');
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回工作台</Link>
            <h1 className="text-2xl font-bold mt-4 mb-1">AI 模型配置</h1>
            <p className="text-gray-500 text-sm">管理 AI 模型 API Key，可配置多个模型随时切换</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/ai-config/guide"
              className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition">
              完整指南
            </Link>
            <Link href="/ai-config/usage"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition">
              用量统计
            </Link>
          </div>
        </div>

        {configs.length > 0 && (
          <div className="space-y-3 mb-6">
            {configs.map(c => {
              const p = providers.find(p => p.id === c.provider);
              return (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{p?.name || c.provider}</p>
                        {p?.docsUrl && (
                          <Link href={p.docsUrl}
                            className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                            文档
                          </Link>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{c.name}</p>
                      {c.baseUrl && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{c.baseUrl}</p>}
                      {c.defaultModel && <p className="text-xs text-gray-400">模型: {c.defaultModel}</p>}
                      {testResult[c.id] === 'success' && <span className="text-xs text-green-600 mt-1 block">连接正常</span>}
                      {testResult[c.id] === 'fail' && (
                        <div className="mt-1">
                          <span className="text-xs text-red-600">连接失败</span>
                          {testError[c.id] && (
                            <p className="text-xs text-red-500 mt-0.5 break-words">{testError[c.id]}</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleTest(c.id)} disabled={testingId === c.id}
                        className="text-sm text-gray-500 hover:text-gray-900">
                        {testingId === c.id ? '测试中...' : '测试'}
                      </button>
                      <button className="text-sm text-red-500 hover:text-red-700"
                        onClick={() => deleteConfig.mutate({ id: c.id })}>删除</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!adding ? (
          <button onClick={() => setAdding(true)} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-gray-400 hover:text-gray-700 transition">
            + 添加 AI 模型
          </button>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold mb-4">选择模型</h3>
            <div className="space-y-2 mb-4">
              {providers.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <button onClick={() => selectProvider(p.id)}
                    className={`flex-1 text-left p-3 rounded-lg border transition ${form.provider === p.id ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{p.name}</span>
                      {p.tag && <span className={`text-xs ${p.tagColor} px-2 py-0.5 rounded-full`}>{p.tag}</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{p.desc}</p>
                  </button>
                  {p.docsUrl && form.provider === p.id && (
                    <Link href={p.docsUrl}
                      className="px-3 py-3 text-sm font-medium text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                      文档
                    </Link>
                  )}
                </div>
              ))}
            </div>
            {form.provider === 'longcat' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-emerald-900 mb-2">LongCat 免费模型接入指引</h4>
                <ol className="text-sm text-emerald-800 space-y-1.5 list-decimal list-inside">
                  <li>访问 <span className="font-mono bg-emerald-100 px-1 rounded">longcat.chat</span> 注册账号</li>
                  <li>进入「API广场」，点击「申请更多额度」</li>
                  <li>填写简单问题后即可获得每日 5000 万 token 免费额度</li>
                  <li>在 API 管理页面创建 API Key</li>
                  <li>将 API Key 粘贴到下方输入框</li>
                </ol>
              </div>
            )}
            {form.provider === 'deepseek' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-blue-900 mb-2">DeepSeek 付费模型接入指引</h4>
                <ol className="text-sm text-blue-800 space-y-1.5 list-decimal list-inside">
                  <li>访问 <span className="font-mono bg-blue-100 px-1 rounded">https://platform.deepseek.com/</span> 注册账号</li>
                  <li>在控制台完成实名认证和充值</li>
                  <li>进入「API Keys」页面创建新的 API Key</li>
                  <li>将 API Key 粘贴到下方输入框，API 地址和模型已自动填充</li>
                </ol>
              </div>
            )}
            {form.provider === 'qwen' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-amber-900 mb-2">通义千问 付费模型接入指引</h4>
                <ol className="text-sm text-amber-800 space-y-1.5 list-decimal list-inside">
                  <li>访问 <span className="font-mono bg-amber-100 px-1 rounded">https://bailian.console.aliyun.com/</span> 登录阿里云账号</li>
                  <li>在百炼控制台开通模型服务并充值</li>
                  <li>进入「API-KEY管理」页面创建 API Key</li>
                  <li>将 API Key 粘贴到下方输入框，API 地址和模型已自动填充</li>
                </ol>
              </div>
            )}
            {form.provider && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                  <input type="password" value={form.apiKey}
                    onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="sk-..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">API 地址</label>
                  <input type="url" value={form.baseUrl}
                    onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono text-sm"
                    placeholder="https://api.example.com/v1" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">模型名称</label>
                  <input type="text" value={form.defaultModel}
                    onChange={e => setForm(f => ({ ...f, defaultModel: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono text-sm"
                    placeholder="如 gpt-4o、claude-sonnet-4-20250514" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => { setAdding(false); setForm({ provider: '', apiKey: '', baseUrl: '', defaultModel: '' }); }}
                    className="px-4 py-2 text-gray-600 hover:text-gray-900">取消</button>
                  <button onClick={handleAdd} disabled={saveConfig.isLoading}
                    className="flex-1 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50">
                    {saveConfig.isLoading ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
