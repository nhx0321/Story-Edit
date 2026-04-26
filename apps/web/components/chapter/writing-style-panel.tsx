'use client';

import { useState, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { streamAiChat } from '@/lib/ai-stream';

interface WritingStylePanelProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

const STYLE_TEMPLATES = [
  { id: 'default', name: '默认风格', style: { pacing: '适中', perspective: '第三人称', tone: '中性' } },
  { id: 'fast', name: '快节奏爽文', style: { pacing: '快节奏', perspective: '第三人称', tone: '热血爽快', description: '开篇即冲突，每章至少一个高潮，对话简短有力，减少环境描写，强化动作和对话推动剧情。' } },
  { id: 'detail', name: '细腻描写风', style: { pacing: '舒缓', perspective: '第三人称', tone: '文艺细腻', description: '注重环境氛围渲染和人物心理描写，多用比喻和修辞，对话带有潜台词，节奏舒缓但信息密度高。' } },
  { id: 'humor', name: '轻松幽默风', style: { pacing: '轻快', perspective: '第一人称', tone: '幽默诙谐', description: '吐槽式叙述，轻松搞笑的对话风格，夸张的表情和动作描写，适度玩梗和打破第四面墙。' } },
];

type PanelTab = 'templates' | 'import' | 'test';

export function WritingStylePanel({ open, onClose, projectId }: WritingStylePanelProps) {
  const { data: savedStyle, isLoading } = trpc.project.getWritingStyle.useQuery({ projectId }, { enabled: open });
  const { data: configs } = trpc.ai.listConfigs.useQuery(undefined, { enabled: open });

  const saveMutation = trpc.project.saveWritingStyle.useMutation({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const [styleName, setStyleName] = useState('');
  const [styleDescription, setStyleDescription] = useState('');
  const [activeTemplate, setActiveTemplate] = useState('');
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('templates');

  // 文件导入
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importedText, setImportedText] = useState('');
  const [importing, setImporting] = useState(false);

  // AI 分析
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');

  // 试写测试
  const [testTopic, setTestTopic] = useState('');
  const [testResult, setTestResult] = useState('');
  const [testGenerating, setTestGenerating] = useState(false);

  // Load saved style when data arrives
  if (!isLoading && savedStyle && !styleName && !styleDescription) {
    setStyleName(savedStyle.name || '');
    setStyleDescription(savedStyle.description || '');
  }

  const applyTemplate = (templateId: string) => {
    const tpl = STYLE_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return;
    setActiveTemplate(templateId);
    setStyleName(tpl.name);
    setStyleDescription(tpl.style.description || '');
  };

  const handleSave = () => {
    saveMutation.mutate({
      projectId,
      writingStyle: {
        name: styleName,
        description: styleDescription,
        updatedAt: new Date().toISOString(),
      },
    });
  };

  // 文件导入处理
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload/parse-document', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('解析失败');
      const data = await res.json();
      setImportedText(data.text || '');
    } catch {
      // 如果解析失败，尝试读取为纯文本
      try {
        const text = await file.text();
        setImportedText(text);
      } catch {
        alert('无法解析该文件，请尝试其他格式（docx/pdf/txt）');
      }
    }
    setImporting(false);
  };

  // AI 风格分析
  const handleAnalyzeStyle = async () => {
    if (!importedText.trim() || !configs || configs.length === 0) {
      alert('请先导入文档或配置 AI 模型');
      return;
    }
    setAnalyzing(true);
    setAnalysisResult('');
    try {
      const systemMsg = { role: 'system' as const, content: '你是一名文学风格分析专家。请分析以下文本的写作风格特征，包括：节奏、视角、语气、句式特点、修辞手法、对话风格、描写风格等。输出格式化的分析报告。' };
      const userMsg = { role: 'user' as const, content: `请分析以下文本的写作风格：\n\n${importedText.slice(0, 6000)}` };
      let result = '';
      for await (const chunk of streamAiChat({
        configId: configs[0].id,
        messages: [systemMsg, userMsg],
        projectId,
      })) {
        if (chunk.error) break;
        if (chunk.content) {
          result += chunk.content;
          setAnalysisResult(result);
        }
      }
      if (!result) setAnalysisResult('分析完成，未获取到结果');
    } catch {
      setAnalysisResult('风格分析失败');
    }
    setAnalyzing(false);
  };

  // 应用分析结果到风格描述
  const applyAnalysisToStyle = () => {
    if (!analysisResult) return;
    setStyleDescription(analysisResult);
    setActiveTab('templates');
  };

  // 试写测试
  const handleTestWrite = async () => {
    if (!styleDescription || !configs || configs.length === 0) {
      alert('请先设置写作风格或配置 AI 模型');
      return;
    }
    setTestGenerating(true);
    setTestResult('');
    try {
      const systemMsg = { role: 'system' as const, content: `你严格按照以下写作风格进行创作：\n${styleDescription}\n\n请根据用户的命题写一段短文（200-500字）。` };
      const userMsg = { role: 'user' as const, content: testTopic || '请写一段场景描写的示例，展示你的写作风格。' };
      let result = '';
      for await (const chunk of streamAiChat({
        configId: configs[0].id,
        messages: [systemMsg, userMsg],
        projectId,
      })) {
        if (chunk.error) break;
        if (chunk.content) {
          result += chunk.content;
          setTestResult(result);
        }
      }
    } catch {
      setTestResult('试写失败');
    }
    setTestGenerating(false);
  };

  if (!open) return null;

  const tabs = [
    { key: 'templates' as PanelTab, label: '风格模板' },
    { key: 'import' as PanelTab, label: '文件导入' },
    { key: 'test' as PanelTab, label: '试写测试' },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">写作风格</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: 风格模板 */}
        {activeTab === 'templates' && (
          <>
            {/* 预设风格模板 */}
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-500 mb-2">预设风格模板</p>
              <div className="grid grid-cols-2 gap-2">
                {STYLE_TEMPLATES.map(tpl => (
                  <button key={tpl.id} onClick={() => applyTemplate(tpl.id)}
                    className={`text-left p-3 rounded-lg border text-sm transition ${
                      activeTemplate === tpl.id ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'
                    }`}>
                    <p className="font-medium text-gray-900">{tpl.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{tpl.style.pacing} · {tpl.style.perspective}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 自定义风格 */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">风格名称</label>
                <input type="text" value={styleName} onChange={e => setStyleName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  placeholder="如：快节奏爽文风格" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">风格描述</label>
                <textarea value={styleDescription} onChange={e => setStyleDescription(e.target.value)}
                  className="w-full h-32 px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
                  placeholder="描述你的写作风格要求，如：开篇直接进入剧情，每章至少一个爽点，结尾留悬念钩子..." />
              </div>
            </div>

            {/* 当前风格预览 */}
            {styleDescription && (
              <div className="bg-gray-50 rounded-lg p-3 mb-4 border border-gray-200">
                <p className="text-xs text-gray-400 mb-1">当前风格预览</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-3">{styleDescription}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={onClose}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                取消
              </button>
              <button onClick={handleSave} disabled={saveMutation.isPending}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                {saveMutation.isPending ? '保存中...' : saved ? '已保存 ✓' : '保存风格'}
              </button>
            </div>
          </>
        )}

        {/* Tab: 文件导入 + AI 分析 */}
        {activeTab === 'import' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">导入参考文档（docx/pdf/txt），AI 将自动分析其写作风格</p>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-500 transition"
              >
                <input ref={fileInputRef} type="file" accept=".docx,.pdf,.txt" onChange={handleFileSelect} className="hidden" />
                {importing ? (
                  <p className="text-sm text-gray-400">解析文件中...</p>
                ) : importFileName ? (
                  <div>
                    <p className="text-sm font-medium text-gray-900">{importFileName}</p>
                    <p className="text-xs text-gray-400 mt-1">{importedText.length} 字符</p>
                    <p className="text-xs text-gray-400 mt-2">点击重新选择文件</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-500">点击或拖拽上传文档</p>
                    <p className="text-xs text-gray-400 mt-1">支持 docx / pdf / txt 格式</p>
                  </div>
                )}
              </div>
            </div>

            {importedText && (
              <>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 max-h-40 overflow-y-auto">
                  <p className="text-xs text-gray-400 mb-1">文档内容预览</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-5">{importedText.slice(0, 500)}</p>
                </div>

                <button onClick={handleAnalyzeStyle} disabled={analyzing || !configs || configs.length === 0}
                  className="w-full py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                  {analyzing ? 'AI 分析中...' : 'AI 风格分析'}
                </button>

                {analysisResult && (
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-gray-500">风格分析结果</p>
                      <button onClick={applyAnalysisToStyle}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                        应用到风格描述
                      </button>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{analysisResult}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab: 试写测试 */}
        {activeTab === 'test' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">输入一个命题，AI 将按照当前风格描述进行试写</p>
              <input type="text" value={testTopic} onChange={e => setTestTopic(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                placeholder="如：主角第一次使用能力的场景" />
            </div>

            <button onClick={handleTestWrite} disabled={!styleDescription || testGenerating || !configs || configs.length === 0}
              className="w-full py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
              {testGenerating ? '生成中...' : '开始试写'}
            </button>

            {testResult && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="text-xs text-gray-400 mb-2">试写结果</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{testResult}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
