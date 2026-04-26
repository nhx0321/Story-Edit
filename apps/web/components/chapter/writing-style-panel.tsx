'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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

// 试写版本号
type WriteVersion = 1 | 2 | 3;

interface VersionResult {
  content: string;
  generating: boolean;
  feedback: string;
  feedbackLoading: boolean;
}

export function WritingStylePanel({ open, onClose, projectId }: WritingStylePanelProps) {
  const { data: savedStyle, isLoading } = trpc.project.getWritingStyle.useQuery({ projectId }, { enabled: open });
  const { data: configs } = trpc.ai.listConfigs.useQuery(undefined, { enabled: open });
  // 大纲树（用于导入章节梗概）
  const { data: outlineTree } = trpc.project.getOutlineTree.useQuery(
    { projectId },
    { enabled: open },
  );

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
  // 最小化状态
  const [minimized, setMinimized] = useState(false);

  // 文件导入
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importedText, setImportedText] = useState('');
  const [importing, setImporting] = useState(false);

  // AI 分析
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');

  // 试写测试 — 章节梗概选择
  const allChapters = (() => {
    if (!outlineTree) return [];
    const result: Array<{ id: string; title: string; synopsis: string | null }> = [];
    for (const vol of outlineTree) {
      for (const unit of (vol as any).units || []) {
        for (const ch of unit.chapters || []) {
          result.push({ id: ch.id, title: ch.title, synopsis: ch.synopsis });
        }
      }
    }
    return result;
  })();
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');

  // 试写测试 — 三栏结果
  const [testTopic, setTestTopic] = useState('');
  const [versions, setVersions] = useState<Record<WriteVersion, VersionResult>>({
    1: { content: '', generating: false, feedback: '', feedbackLoading: false },
    2: { content: '', generating: false, feedback: '', feedbackLoading: false },
    3: { content: '', generating: false, feedback: '', feedbackLoading: false },
  });

  // 选中章节的梗概文本
  const selectedChapterSynopsis = selectedChapterId
    ? allChapters.find(c => c.id === selectedChapterId)?.synopsis || ''
    : '';

  // Load saved style when data arrives
  useEffect(() => {
    if (savedStyle && !styleName && !styleDescription) {
      setStyleName(savedStyle.name || '');
      setStyleDescription(savedStyle.description || '');
    }
  }, [savedStyle, styleName, styleDescription]);

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

  // === 三栏试写 ===

  const buildWritePrompt = useCallback((version: WriteVersion, initial: boolean = true) => {
    let systemPrompt = `你严格按照以下写作风格进行创作：\n${styleDescription}\n\n`;
    if (version === 1) {
      systemPrompt += '严格按照上述风格描述进行创作，保持一致的艺术风格和表达方式。';
    } else if (version === 2) {
      systemPrompt += '在保持核心风格的基础上，侧重不同的情节走向可能性，尝试与原梗概不同的剧情发展。';
    } else {
      systemPrompt += '在保持核心风格的基础上，侧重不同的表达方式和句式结构，尝试变化的叙述手法。';
    }
    systemPrompt += '\n请写一段短文（200-500字）。';
    return systemPrompt;
  }, [styleDescription]);

  const generateSingleVersion = async (version: WriteVersion, feedbackText?: string) => {
    if (!styleDescription || !configs || configs.length === 0) {
      alert('请先设置写作风格或配置 AI 模型');
      return;
    }

    setVersions(prev => ({
      ...prev,
      [version]: { ...prev[version], generating: true },
    }));

    try {
      const topic = testTopic || '请写一段场景描写的示例，展示你的写作风格。';
      const synopsisPrefix = selectedChapterSynopsis
        ? `以下为本章梗概（仅供参考）：\n${selectedChapterSynopsis}\n\n`
        : '';

      let userContent: string;
      if (feedbackText) {
        userContent = `${synopsisPrefix}之前生成的试写内容如下，用户提出了修改意见，请根据意见重新创作。\n\n修改意见：${feedbackText}\n\n原题：${topic}`;
      } else {
        userContent = `${synopsisPrefix}命题：${topic}`;
      }

      const systemContent = buildWritePrompt(version, !feedbackText);
      const systemMsg = { role: 'system' as const, content: systemContent };
      const userMsg = { role: 'user' as const, content: userContent };

      let result = '';
      for await (const chunk of streamAiChat({
        configId: configs[0].id,
        messages: [systemMsg, userMsg],
        projectId,
      })) {
        if (chunk.error) break;
        if (chunk.content) {
          result += chunk.content;
          setVersions(prev => ({
            ...prev,
            [version]: { ...prev[version], content: result },
          }));
        }
      }
    } catch {
      setVersions(prev => ({
        ...prev,
        [version]: { ...prev[version], content: '试写失败' },
      }));
    }
    setVersions(prev => ({
      ...prev,
      [version]: { ...prev[version], generating: false },
    }));
  };

  const generateAllVersions = () => {
    generateSingleVersion(1);
    generateSingleVersion(2);
    generateSingleVersion(3);
  };

  const handleFeedbackRefine = async (version: WriteVersion) => {
    const feedback = versions[version].feedback;
    if (!feedback.trim()) return;
    setVersions(prev => ({
      ...prev,
      [version]: { ...prev[version], feedbackLoading: true },
    }));
    await generateSingleVersion(version, feedback);
    setVersions(prev => ({
      ...prev,
      [version]: { ...prev[version], feedback: '', feedbackLoading: false },
    }));
  };

  const resetVersions = () => {
    setVersions({
      1: { content: '', generating: false, feedback: '', feedbackLoading: false },
      2: { content: '', generating: false, feedback: '', feedbackLoading: false },
      3: { content: '', generating: false, feedback: '', feedbackLoading: false },
    });
  };

  if (!open) return null;

  const tabs = [
    { key: 'templates' as PanelTab, label: '风格模板' },
    { key: 'import' as PanelTab, label: '文件导入' },
    { key: 'test' as PanelTab, label: '试写测试' },
  ];

  // 最小化模式：只显示标题栏
  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-72 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">写作风格</h3>
            <div className="flex items-center gap-1">
              <button onClick={() => setMinimized(false)}
                className="text-gray-400 hover:text-gray-600 text-sm px-1" title="展开">
                □
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
            </div>
          </div>
          <div className="p-3 text-xs text-gray-500 text-center">
            已完成：{styleName || '未设置风格'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-4xl flex flex-col" style={{ height: '640px' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 shrink-0">
          <h3 className="text-lg font-bold">写作风格</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setMinimized(true)}
              className="text-gray-400 hover:text-gray-600 text-sm px-1" title="最小化">
              —
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 px-6 border-b border-gray-200 shrink-0">
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

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
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

          {/* Tab: 试写测试（重构版） */}
          {activeTab === 'test' && (
            <div className="space-y-4">
              {/* 导入章节梗概 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">导入章节梗概（可选）</label>
                <select
                  value={selectedChapterId}
                  onChange={e => setSelectedChapterId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white"
                >
                  <option value="">不导入梗概</option>
                  {allChapters.map(ch => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title}{ch.synopsis ? ` — ${ch.synopsis.slice(0, 30)}${ch.synopsis.length > 30 ? '...' : ''}` : ''}
                    </option>
                  ))}
                </select>
                {selectedChapterSynopsis && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{selectedChapterSynopsis}</p>
                )}
              </div>

              {/* 命题输入 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">试写命题</label>
                <div className="flex gap-2">
                  <input type="text" value={testTopic} onChange={e => setTestTopic(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                    placeholder="如：主角第一次使用能力的场景" />
                  <button onClick={generateAllVersions}
                    disabled={!styleDescription || !configs || configs.length === 0}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                    生成三版
                  </button>
                </div>
              </div>

              {/* 三栏试写结果 */}
              {([1, 2, 3] as WriteVersion[]).some(v => versions[v].content || versions[v].generating) && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-medium text-gray-500">试写结果对比</p>
                    <button onClick={resetVersions}
                      className="text-xs text-gray-400 hover:text-gray-600 transition">
                      清空结果
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {([1, 2, 3] as WriteVersion[]).map(v => {
                      const versionLabels: Record<WriteVersion, string> = {
                        1: 'V1 · 严格遵循风格',
                        2: 'V2 · 不同情节走向',
                        3: 'V3 · 不同表达方式',
                      };
                      return (
                        <div key={v} className="border border-gray-200 rounded-lg flex flex-col bg-gray-50">
                          <div className="px-3 py-2 border-b border-gray-200 bg-white rounded-t-lg">
                            <p className="text-xs font-semibold text-gray-700">{versionLabels[v]}</p>
                          </div>
                          <div className="p-3 flex-1 min-h-0">
                            {versions[v].generating ? (
                              <div className="flex items-center justify-center h-full py-8">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                                  <span className="text-xs text-gray-400">生成中...</span>
                                </div>
                              </div>
                            ) : versions[v].content ? (
                              <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{versions[v].content}</p>
                            ) : (
                              <div className="flex items-center justify-center h-full py-8">
                                <span className="text-xs text-gray-300">等待生成</span>
                              </div>
                            )}
                          </div>
                          {/* 反馈输入 */}
                          {versions[v].content && !versions[v].generating && (
                            <div className="px-3 py-2 border-t border-gray-200">
                              <div className="flex gap-1">
                                <input
                                  type="text"
                                  value={versions[v].feedback}
                                  onChange={e => setVersions(prev => ({
                                    ...prev,
                                    [v]: { ...prev[v], feedback: e.target.value },
                                  }))}
                                  placeholder="修改意见..."
                                  className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
                                />
                                <button
                                  onClick={() => handleFeedbackRefine(v)}
                                  disabled={!versions[v].feedback.trim() || versions[v].feedbackLoading}
                                  className="px-2 py-1 bg-gray-800 text-white rounded text-xs font-medium hover:bg-gray-700 transition disabled:opacity-50"
                                >
                                  {versions[v].feedbackLoading ? '...' : '修改'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 底部提示 */}
              {!styleDescription && (
                <p className="text-xs text-amber-600 text-center">请先在「风格模板」标签页设置写作风格</p>
              )}
            </div>
          )}
        </div>

        {/* Footer: 确认风格按钮 */}
        <div className="px-6 py-3 border-t border-gray-200 shrink-0 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {styleDescription ? `当前风格：${styleName || '未命名'} · ${styleDescription.slice(0, 50)}${styleDescription.length > 50 ? '...' : ''}` : '未设置写作风格'}
          </p>
          <button onClick={handleSave} disabled={saveMutation.isPending || !styleDescription}
            className="px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition disabled:opacity-50">
            {saveMutation.isPending ? '保存中...' : saved ? '已确认保存 ✓' : '确认风格'}
          </button>
        </div>
      </div>
    </div>
  );
}
