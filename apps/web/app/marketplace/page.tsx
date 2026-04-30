'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { PurchaseImportDialog } from '@/components/template/purchase-import-dialog';

type SourceFilter = 'all' | 'official' | 'user';
type SortBy = 'hot' | 'rating' | 'price' | 'newest';
type TabKey = 'all' | 'views' | 'purchases';
type AiRoleFilter = 'all' | 'editor' | 'setting_editor' | 'writer';

const AI_ROLE_LABELS: Record<string, string> = {
  editor: '文学编辑',
  setting_editor: '设定编辑',
  writer: '正文作者',
};

const AI_ROLE_COLORS_MAP: Record<string, string> = {
  editor: 'bg-blue-100 text-blue-700',
  setting_editor: 'bg-purple-100 text-purple-700',
  writer: 'bg-green-100 text-green-700',
};

export default function MarketplacePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [category, setCategory] = useState('');
  const [aiRoleFilter, setAiRoleFilter] = useState<AiRoleFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [search, setSearch] = useState('');
  const [useSearch, setUseSearch] = useState(false);
  const [importTemplate, setImportTemplate] = useState<{ id: string; title: string } | null>(null);
  const utils = trpc.useUtils();

  // 正常列表
  const { data: templates = [], isLoading } = trpc.template.list.useQuery({
    source: sourceFilter === 'all' ? undefined : sourceFilter,
    category: category || undefined,
    sortBy,
  }, { enabled: !useSearch && activeTab === 'all' });

  // 搜索
  const { data: searchResults = [], isLoading: searchLoading } = trpc.template.search.useQuery({
    query: search,
    category: category || undefined,
    sortBy,
  }, { enabled: useSearch && search.length > 0 && activeTab === 'all' });

  // 已查看
  const { data: likedTemplates = [], isLoading: likesLoading } = trpc.template.myLikes.useQuery(undefined, {
    enabled: activeTab === 'views',
  });

  // 已购买
  const { data: purchasedTemplates = [], isLoading: purchasesLoading } = trpc.template.myPurchases.useQuery(undefined, {
    enabled: activeTab === 'purchases',
  });

  const displayItems = activeTab === 'all'
    ? (useSearch && search.length > 0 ? searchResults : templates)
    : activeTab === 'views'
      ? likedTemplates.map(l => ({ ...l.template, ratedAt: l.ratedAt }))
      : purchasedTemplates.map(p => ({ ...p.template, purchasePrice: p.purchasePrice, purchasedAt: p.purchasedAt }));

  // AI 角色过滤（客户端过滤）
  const roleFilteredItems = aiRoleFilter === 'all'
    ? displayItems
    : displayItems.filter(item => (item as any).aiTargetRole === aiRoleFilter);

  const loading = activeTab === 'all'
    ? (useSearch ? searchLoading : isLoading)
    : activeTab === 'views'
      ? likesLoading
      : purchasesLoading;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) setUseSearch(true);
    else setUseSearch(false);
  };

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setUseSearch(false);
    setSearch('');
  };

  const allCategories = [
    { key: '', label: '全部' },
    { key: 'methodology', label: '方法论' },
    { key: 'structure', label: '剧本结构' },
    { key: 'style', label: '正文风格' },
    { key: 'setting', label: '设定' },
    { key: 'ai_prompt', label: 'AI角色提示词' },
  ];

  return (
    <main className="min-h-screen bg-gray-50 p-8" data-guide-target="template-list">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">模板广场</h1>
            <p className="text-gray-500 text-sm mt-1">浏览创作资源，提升写作效率</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard/earnings"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition">
              模板收益
            </Link>
            <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回工作台</a>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-2 mb-4">
          {([['all', '全部模板'], ['views', '已查看'], ['purchases', '已购买']] as const).map(([key, label]) => (
            <button key={key}
              onClick={() => handleTabChange(key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === key
                  ? 'bg-gray-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>{label}</button>
          ))}
        </div>

        {/* 搜索和筛选（仅全部模板显示） */}
        {activeTab === 'all' && (
          <>
            <form onSubmit={handleSearch} className="flex gap-2 mb-4">
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); if (!e.target.value) setUseSearch(false); }}
                placeholder="搜索模板 · 标题/描述/创建者..."
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <button type="submit"
                className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                搜索
              </button>
              {useSearch && (
                <button type="button" onClick={() => { setUseSearch(false); setSearch(''); }}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition">
                  重置
                </button>
              )}
            </form>

            {/* 来源筛选 + 排序 */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex gap-2">
                {([['all', '全部'], ['official', '官方免费'], ['user', '用户上传']] as const).map(([key, label]) => (
                  <button key={key}
                    onClick={() => setSourceFilter(key)}
                    className={`px-4 py-1.5 rounded-full text-sm border transition ${
                      sourceFilter === key ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 hover:border-gray-500'
                    }`}>{label}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">排序：</span>
                {([['hot', '热度'], ['rating', '评分'], ['newest', '最新']] as const).map(([key, label]) => (
                  <button key={key}
                    onClick={() => setSortBy(key)}
                    className={`text-xs px-2 py-1 rounded transition ${
                      sortBy === key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'
                    }`}>{label}</button>
                ))}
              </div>
            </div>

            {/* 分类 */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {allCategories.map(c => (
                <button key={c.key} onClick={() => setCategory(c.key)}
                  className={`px-4 py-1.5 rounded-full text-sm border transition ${
                    category === c.key ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 hover:border-gray-500'
                  }`}>{c.label}</button>
              ))}
            </div>

            {/* AI 角色筛选 */}
            <div className="flex gap-2 mb-6 flex-wrap items-center">
              <span className="text-xs text-gray-400 mr-1">AI 角色：</span>
              {([['all', '全部'], ['editor', '文学编辑'], ['setting_editor', '设定编辑'], ['writer', '正文作者']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setAiRoleFilter(key as AiRoleFilter)}
                  className={`px-4 py-1.5 rounded-full text-sm border transition ${
                    aiRoleFilter === key ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 hover:border-gray-500'
                  }`}>{label}</button>
              ))}
            </div>
          </>
        )}

        {/* 模板列表 */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">加载中...</div>
        ) : roleFilteredItems.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            {activeTab === 'all' ? (
              <>
                <p>暂无匹配的模板</p>
                {sourceFilter === 'user' && (
                  <p className="text-sm mt-2">还没有用户上传的模板</p>
                )}
              </>
            ) : activeTab === 'views' ? (
              <>
                <p>还没有查看的模板</p>
                <p className="text-sm mt-2">去 <button onClick={() => handleTabChange('all')} className="text-gray-600 hover:text-gray-900 underline">全部模板</button> 逛逛吧</p>
              </>
            ) : (
              <>
                <p>还没有购买的模板</p>
                <p className="text-sm mt-2">去 <button onClick={() => handleTabChange('all')} className="text-gray-600 hover:text-gray-900 underline">全部模板</button> 看看吧</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roleFilteredItems.map(item => (
              <TemplateCard
                key={item.id}
                item={item}
                showImport={activeTab === 'purchases'}
                onImport={() => setImportTemplate({ id: item.id, title: item.title })}
              />
            ))}
          </div>
        )}
      </div>

      {/* 导入到项目对话框 */}
      {importTemplate && (
        <PurchaseImportDialog
          templateId={importTemplate.id}
          templateTitle={importTemplate.title}
          onClose={() => setImportTemplate(null)}
          onImported={() => utils.template.myPurchases.invalidate()}
        />
      )}
    </main>
  );
}

function TemplateCard({ item, showImport, onImport }: {
  item: {
    id: string; title: string; description?: string | null; source: string;
    category?: string | null; price: number | null; viewCount: number | null; importCount: number | null;
    avgRating?: number; ratingCount?: number;
    aiTargetRole?: string | null;
    uploader?: { id: string; nickname: string | null; displayId: string | null; avatarUrl: string | null; vipLevel?: string } | null;
    purchasePrice?: number | null; purchasedAt?: Date | string | null;
    ratedAt?: Date | string | null;
  };
  showImport?: boolean;
  onImport?: () => void;
}) {
  const utils = trpc.useUtils();
  const likeMutation = trpc.template.like.useMutation({
    onSuccess: () => {
      utils.template.list.invalidate();
      utils.template.getById.invalidate({ id: item.id });
    },
  });
  const importMutation = trpc.template.importTemplate.useMutation();

  const handleLike = async () => {
    if (!confirm('查看全文将消耗 1 精灵豆，确认继续？')) return;
    try {
      await likeMutation.mutateAsync({ templateId: item.id });
    } catch (e: any) {
      alert(e.message || '查看失败');
    }
  };

  const handleImport = async () => {
    if (!confirm('导入将消耗 10 精灵豆，确认继续？')) return;
    try {
      await importMutation.mutateAsync({ templateId: item.id });
      utils.template.list.invalidate();
    } catch (e: any) {
      alert(e.message || '导入失败');
    }
  };

  return (
    <Link href={`/marketplace/${item.id}`}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-400 transition block">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.category || '未分类'}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            item.source === 'official' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
          }`}>{item.source === 'official' ? '官方' : '用户上传'}</span>
          {item.aiTargetRole && AI_ROLE_LABELS[item.aiTargetRole] && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${AI_ROLE_COLORS_MAP[item.aiTargetRole]}`}>
              {AI_ROLE_LABELS[item.aiTargetRole]}
            </span>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${(item.price ?? 0) === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {item.source === 'official' ? '免费' : '1豆查看 · 10豆导入'}
        </span>
      </div>
      <h3 className="font-semibold">{item.title}</h3>
      <p className="text-sm text-gray-500 mt-1 line-clamp-2">
        {item.description && item.description.length > 200
          ? item.description.slice(0, 200) + '...'
          : item.description}
      </p>
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
        <span>{item.viewCount} 浏览</span>
        <span>{item.importCount} 导入</span>
        {item.avgRating !== undefined && item.avgRating > 0 && <span>{typeof item.avgRating === 'number' ? item.avgRating.toFixed(1) : '暂无'} 分 ({item.ratingCount})</span>}
        {item.purchasedAt && <span>购买于 {new Date(item.purchasedAt).toLocaleDateString('zh-CN')}</span>}
      </div>
      {/* 创作者信息 */}
      {item.uploader && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
          <span className="text-xs">{item.uploader.avatarUrl || '👤'}</span>
          <span className="text-xs text-gray-500">{item.uploader.nickname || '未知'}</span>
          {item.uploader.displayId && (
            <span className="text-xs text-gray-300">{item.uploader.displayId}</span>
          )}
        </div>
      )}
      {/* 已购买模板的操作按钮 */}
      {showImport && onImport && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onImport(); }}
            className="w-full py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition"
          >
            导入到项目
          </button>
        </div>
      )}
    </Link>
  );
}
