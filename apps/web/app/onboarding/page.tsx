'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';

type Step = 'choose' | 'config' | 'test' | 'done';

const providers = [
  {
    id: 'longcat', name: 'LongCat',
    desc: '零成本上手，官方可申请每日 5000 万 Token免费额度',
    url: 'https://longcat.chat',
    tag: '限时免费',
  },
  {
    id: 'deepseek', name: 'DeepSeek',
    desc: '高性价比，中文表现优秀，适宜打磨单章',
    url: 'https://platform.deepseek.com',
    tag: '短文免费',
  },
  {
    id: 'qwen', name: '通义千问（Qwen）',
    desc: '官网注册付费，撰写能力优质',
    url: 'https://dashscope.console.aliyun.com',
    tag: '付费高质',
  },
  {
    id: 'custom', name: '自定义（OpenAI 兼容）',
    desc: '填写任意 OpenAI 兼容 API 地址和 Key',
    url: '',
    tag: '',
  },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('choose');
  const [provider, setProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);
  const [testError, setTestError] = useState('');
  const [savedConfigId, setSavedConfigId] = useState('');

  const saveConfig = trpc.ai.saveConfig.useMutation();
  const testConnection = trpc.ai.testConnection.useMutation();

  const currentProvider = providers.find(p => p.id === provider);

  const handleSaveAndTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError('');
    try {
      if (!savedConfigId) {
        const config = await saveConfig.mutateAsync({
          provider: provider as 'deepseek' | 'longcat' | 'qwen' | 'custom',
          name: currentProvider?.name || provider,
          apiKey,
          baseUrl: baseUrl || undefined,
        });
        setSavedConfigId(config.id);
        const result = await testConnection.mutateAsync({ configId: config.id });
        setTestResult(result.ok ? 'success' : 'fail');
        if (!result.ok && result.error) setTestError(result.error);
      } else {
        const result = await testConnection.mutateAsync({ configId: savedConfigId });
        setTestResult(result.ok ? 'success' : 'fail');
        if (!result.ok && result.error) setTestError(result.error);
      }
    } catch (e) {
      setTestResult('fail');
      setTestError(e instanceof Error ? e.message : '未知错误');
    }
    setTesting(false);
  };

  const tagColors: Record<string, string> = {
    '限时免费': 'bg-emerald-100 text-emerald-700',
    '短文免费': 'bg-blue-100 text-blue-700',
    '付费高质': 'bg-amber-100 text-amber-700',
  };
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        {/* 进度指示 */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {['选择模型', '配置', '测试'].map((label, i) => {
            const steps: Step[] = ['choose', 'config', 'test'];
            const isActive = steps.indexOf(step) >= i;
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  isActive ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'
                }`}>{i + 1}</div>
                <span className={`text-sm ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
                {i < 2 && <div className="w-8 h-px bg-gray-300" />}
              </div>
            );
          })}
        </div>

        {/* Step 1: 选择模型 */}
        {step === 'choose' && (
          <div>
            <h2 className="text-xl font-bold mb-2">开始创作</h2>
            <p className="text-sm text-gray-500 mb-6">选择适合你的 AI 接入方式</p>

            {/* 平台Token — 推荐 */}
            <button onClick={() => router.push('/dashboard')}
              className="w-full text-left p-5 rounded-lg border-2 border-gray-900 bg-gray-50 hover:bg-gray-100 transition mb-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">使用平台 Token</span>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">推荐</span>
              </div>
              <p className="text-sm text-gray-600 mt-1.5">无需配置 API Key，免费模型每日可用 100,000 Token；收费模型按实际用量计费且不受该免费限额影响</p>
              <p className="text-xs text-gray-400 mt-1">支持 DeepSeek / LongCat / Qwen 等模型 · 随时可充值</p>
            </button>

            {/* 分隔 */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">或</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <p className="text-xs text-gray-400 mb-3">使用自有 API Key 调用模型（高级用户）</p>
            <div className="space-y-3">
              {providers.map(p => (
                <button key={p.id}
                  onClick={() => { setProvider(p.id); setApiKey(''); setBaseUrl(''); setSavedConfigId(''); setTestResult(null); setStep('config'); }}
                  className={`w-full text-left p-4 rounded-lg border transition hover:border-gray-400 ${
                    provider === p.id ? 'border-gray-900 bg-gray-50' : 'border-gray-200'
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.name}</span>
                    {p.tag && <span className={`text-xs ${tagColors[p.tag]} px-2 py-0.5 rounded-full`}>{p.tag}</span>}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{p.desc}</p>
                  {p.url && (
                    <span
                      onClick={(e) => { e.stopPropagation(); window.open(p.url, '_blank'); }}
                      className="inline-block text-xs text-blue-600 hover:text-blue-800 hover:underline mt-1 cursor-pointer">
                      前往注册 &rarr;
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 text-center mt-4">
              自有 Key 调用不走平台 Token 计费，仅使用你提供的 API 额度
            </p>
          </div>
        )}

        {/* Step 2: 填写配置 */}
        {step === 'config' && (
          <div>
            <h2 className="text-xl font-bold mb-2">配置 API Key</h2>
            <p className="text-sm text-gray-500 mb-6">
              你的 API Key 将加密存储，仅用于调用 AI 模型
              {currentProvider?.url && (
                <>
                  {' — '}
                  <a href={currentProvider.url} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline">
                    前往 {currentProvider.name.replace(/（.*）/, '')} 官网获取
                  </a>
                </>
              )}
            </p>
            <div className="space-y-4">
              {provider === 'longcat' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-2">LongCat 免费接入指引</h3>
                  <ol className="text-sm text-blue-800 space-y-1.5 list-decimal list-inside">
                    <li>访问 <a href="https://longcat.chat" target="_blank" rel="noopener noreferrer" className="font-mono bg-blue-100 px-1 rounded text-blue-700 hover:underline">longcat.chat</a> 注册账号</li>
                    <li>进入「API 广场」，点击「申请更多额度」</li>
                    <li>填写简单问题后即可获得每日 5000 万 Token免费额度</li>
                    <li>在 API 管理页面创建 API Key</li>
                    <li>将获取的 API Key 粘贴到下方输入框</li>
                  </ol>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => { setApiKey(e.target.value); setSavedConfigId(''); setTestResult(null); }}
                    className="w-full px-3 py-2 pr-16 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="sk-..." />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded bg-white">
                    {showKey ? '隐藏' : '显示'}
                  </button>
                </div>
              </div>
              {provider === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">API 地址</label>
                  <input type="url" value={baseUrl}
                    onChange={e => setBaseUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="https://api.example.com/v1" />
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep('choose')} className="px-4 py-2 text-gray-600 hover:text-gray-900">返回</button>
              <button onClick={() => setStep('test')} disabled={!apiKey}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50">下一步</button>
            </div>
          </div>
        )}

        {/* Step 3: 测试连接 */}
        {step === 'test' && (
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">测试连接</h2>
            <p className="text-sm text-gray-500 mb-8">保存配置并发送测试消息，验证 AI 模型是否正常工作</p>
            {testResult === 'success' ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-6">
                <p className="text-green-700 font-medium">连接成功！AI 模型已就绪</p>
              </div>
            ) : testResult === 'fail' ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-6 text-left">
                <p className="text-red-700 font-medium">连接失败，请检查配置</p>
                {testError && <p className="text-red-600 text-xs mt-2 break-all">{testError}</p>}
              </div>
            ) : null}
            <div className="flex gap-3">
              <button onClick={() => { setStep('config'); setTestResult(null); }} className="px-4 py-2 text-gray-600 hover:text-gray-900">返回修改</button>
              {testResult !== 'success' ? (
                <button onClick={handleSaveAndTest} disabled={testing}
                  className="flex-1 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50">
                  {testing ? '测试中...' : savedConfigId ? '重新测试' : '保存并测试'}
                </button>
              ) : (
                <button onClick={() => router.push('/dashboard')}
                  className="flex-1 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition">
                  完成，进入主界面
                </button>
              )}
            </div>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="text-center py-8">
            <h2 className="text-2xl font-bold mb-2">一切就绪！</h2>
            <p className="text-gray-500 mb-8">开始你的 AI 辅助创作之旅</p>
            <button onClick={() => router.push('/dashboard')}
              className="inline-block px-8 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition">
              进入工作台
            </button>
          </div>
        )}
      </div>
    </main>
  );
}




