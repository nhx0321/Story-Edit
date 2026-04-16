'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

type TabType = 'items' | 'test';

const SPECIES_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'plant', label: '植物系' },
  { value: 'animal', label: '动物系' },
  { value: 'element', label: '元素系' },
];

export default function AdminSpriteToolsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('items');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">精灵管理</h1>
          <p className="text-sm text-gray-500 mt-1">道具管理 + 精灵功能测试</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setActiveTab('items')}
          className={`px-4 py-2 text-sm rounded-lg font-medium transition ${
            activeTab === 'items' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
          }`}>
          道具管理
        </button>
        <button onClick={() => setActiveTab('test')}
          className={`px-4 py-2 text-sm rounded-lg font-medium transition ${
            activeTab === 'test' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
          }`}>
          精灵测试
        </button>
      </div>

      {activeTab === 'items' ? <ItemManagement /> : <SpriteTestPanel />}
    </div>
  );
}

// ============================================================
// Tab 1: Item Management (道具管理)
// ============================================================

function ItemManagement() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.sprite.adminListItems.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<{
    code: string; name: string; species: string; effectMinutes: number;
    price: number; icon: string; description: string;
  } | null>(null);

  const createMutation = trpc.sprite.adminCreateItem.useMutation({
    onSuccess: () => { utils.sprite.adminListItems.invalidate(); setShowForm(false); setEditingItem(null); },
    onError: (e) => alert(e.message),
  });

  const updateMutation = trpc.sprite.adminUpdateItem.useMutation({
    onSuccess: () => { utils.sprite.adminListItems.invalidate(); setEditingItem(null); setShowForm(false); },
    onError: (e) => alert(e.message),
  });

  const toggleMutation = trpc.sprite.adminToggleItemActive.useMutation({
    onSuccess: () => { utils.sprite.adminListItems.invalidate(); },
    onError: (e) => alert(e.message),
  });

  const deleteMutation = trpc.sprite.adminDeleteItem.useMutation({
    onSuccess: () => { utils.sprite.adminListItems.invalidate(); },
    onError: (e) => alert(e.message),
  });

  const handleSave = () => {
    if (!editingItem) return;
    if (!editingItem.code.trim() || !editingItem.name.trim()) {
      alert('code 和 name 不能为空');
      return;
    }
    // Create new item
    createMutation.mutate({
      code: editingItem.code,
      name: editingItem.name,
      species: editingItem.species as 'plant' | 'animal' | 'element',
      effectMinutes: editingItem.effectMinutes,
      price: editingItem.price,
      icon: editingItem.icon,
      description: editingItem.description,
    });
  };

  const handleUpdate = () => {
    if (!editingItem) return;
    updateMutation.mutate({
      code: editingItem.code,
      name: editingItem.name,
      species: editingItem.species as 'plant' | 'animal' | 'element',
      effectMinutes: editingItem.effectMinutes,
      price: editingItem.price,
      icon: editingItem.icon,
      description: editingItem.description,
    });
  };

  const handleToggleActive = (code: string, isActive: boolean) => {
    toggleMutation.mutate({ code, isActive });
  };

  const handleDelete = (code: string, name: string) => {
    if (!confirm(`确定要删除道具「${name}」吗？此操作不可撤销。`)) return;
    deleteMutation.mutate({ code });
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => {
          setEditingItem({ code: '', name: '', species: 'all', effectMinutes: 0, price: 0, icon: '', description: '' });
          setShowForm(true);
        }} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition">
          + 新建道具
        </button>
      </div>

      {/* Create/Edit Form Modal */}
      {showForm && editingItem && (
        <ItemFormModal
          item={editingItem}
          onChange={setEditingItem}
          onSave={editingItem.code === '' ? handleSave : handleUpdate}
          onCancel={() => { setShowForm(false); setEditingItem(null); }}
          isSaving={createMutation.isPending || updateMutation.isPending}
          isNew={editingItem.code === ''}
        />
      )}

      {/* Items Table */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">加载中...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">图标</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">名称</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Code</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">系别</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">效果(分钟)</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">价格(豆)</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">描述</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">状态</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items?.map(item => (
                <tr key={item.code} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-2xl">{item.icon}</td>
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{item.code}</td>
                  <td className="px-4 py-3 text-xs">{item.species}</td>
                  <td className="px-4 py-3">{item.effectMinutes}</td>
                  <td className="px-4 py-3 text-amber-600 font-medium">{item.price}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">{item.description}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      item.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {item.isActive ? '已上架' : '已下架'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => {
                        setEditingItem({
                          code: item.code, name: item.name ?? '', species: item.species ?? 'all',
                          effectMinutes: item.effectMinutes ?? 0, price: item.price ?? 0,
                          icon: item.icon ?? '', description: item.description ?? '',
                        });
                        setShowForm(true);
                      }} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition">
                        编辑
                      </button>
                      <button onClick={() => handleToggleActive(item.code, !item.isActive)}
                        className={`px-2 py-1 text-xs rounded transition ${
                          item.isActive ? 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100' : 'bg-green-50 text-green-600 hover:bg-green-100'
                        }`}>
                        {item.isActive ? '下架' : '上架'}
                      </button>
                      <button onClick={() => handleDelete(item.code, item.name ?? '')}
                        className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition">
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!items || items.length === 0) && (
            <p className="text-center text-gray-400 py-8 text-sm">暂无道具数据</p>
          )}
        </div>
      )}
    </div>
  );
}

type SpriteToolItem = { code: string; name: string; species: string; effectMinutes: number; price: number; icon: string; description: string };

function ItemFormModal({ item, onChange, onSave, onCancel, isSaving, isNew }: {
  item: SpriteToolItem;
  onChange: (item: SpriteToolItem) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isNew: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-[440px] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold">{isNew ? '新建道具' : '编辑道具'}</h2>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">名称</label>
              <input value={item.name} onChange={e => onChange({ ...item, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="浇水壶" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">图标(emoji)</label>
              <input value={item.icon} onChange={e => onChange({ ...item, icon: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="🚿" />
            </div>
          </div>
          {isNew && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Code</label>
                <input value={item.code} onChange={e => onChange({ ...item, code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono" placeholder="watering_can" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">系别</label>
                <select value={item.species} onChange={e => onChange({ ...item, species: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  {SPECIES_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">价格(精灵豆)</label>
              <input type="number" min={1} value={item.price} onChange={e => onChange({ ...item, price: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">效果(分钟)</label>
              <input type="number" min={0} value={item.effectMinutes} onChange={e => onChange({ ...item, effectMinutes: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">描述</label>
            <input value={item.description} onChange={e => onChange({ ...item, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="加速生长 1 天，精灵经验 +100" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">取消</button>
          <button onClick={onSave} disabled={isSaving}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition disabled:opacity-50">
            {isSaving ? '保存中...' : isNew ? '创建' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Tab 2: Sprite Test Panel (精灵测试)
// ============================================================

function SpriteTestPanel() {
  const { data: myStatus } = trpc.sprite.getSpriteStatus.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: status } = trpc.sprite.getStatus.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: items } = trpc.sprite.getItems.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: myItems } = trpc.sprite.getMyItems.useQuery(undefined, { refetchOnWindowFocus: false });
  const utils = trpc.useUtils();

  // Test mutations
  const [message, setMessage] = useState<string | null>(null);

  const showMessage = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 2500);
  };

  const grantBeansMutation = trpc.sprite.adminGrantBeans.useMutation({
    onSuccess: (data: any) => {
      utils.sprite.getStatus.invalidate();
      showMessage(`充值成功，新余额: ${data.newBalance} 豆`);
    },
    onError: (e: any) => showMessage(e.message || '充值失败'),
  });

  const setLevelMutation = trpc.sprite.adminSetSpriteLevel.useMutation({
    onSuccess: (data: any) => {
      utils.sprite.getSpriteStatus.invalidate();
      utils.sprite.getStatus.invalidate();
      showMessage(`等级已设置为 L${data.newLevel}`);
    },
    onError: (e: any) => showMessage(e.message || '设置等级失败'),
  });

  const buyItemMutation = trpc.sprite.buyItem.useMutation({
    onSuccess: (data: any) => {
      utils.sprite.getStatus.invalidate();
      utils.sprite.getMyItems.invalidate();
      showMessage(`购买成功: ${data.itemIcon} ${data.itemName}`);
    },
    onError: (e: any) => showMessage(e.message || '购买失败'),
  });

  const useItemMutation = trpc.sprite.useItem.useMutation({
    onSuccess: (data: any) => {
      utils.sprite.getSpriteStatus.invalidate();
      utils.sprite.getStatus.invalidate();
      utils.sprite.getMyItems.invalidate();
      showMessage(`使用成功: ${data.itemName}，+${data.daysAdded}天，经验+${data.xpGained}`);
    },
    onError: (e: any) => showMessage(e.message || '使用失败'),
  });

  const grantTestItemsMutation = trpc.sprite.adminGrantTestItems.useMutation({
    onSuccess: (data: any) => {
      utils.sprite.getStatus.invalidate();
      utils.sprite.getMyItems.invalidate();
      showMessage(`测试道具已发放: ${data.granted.join(', ')}`);
    },
    onError: (e: any) => showMessage(e.message || '发放失败'),
  });

  // Broadcast channel for animation control
  const triggerAnimation = (animName: string) => {
    const channel = new BroadcastChannel('sprite-admin-preview');
    channel.postMessage({ type: 'preview-anim', animName });
    channel.close();
    showMessage(`已触发精灵动画: ${animName}`);
  };

  const triggerLevelUp = () => {
    const channel = new BroadcastChannel('sprite-admin-preview');
    const level = ('level' in (status ?? {}) ? (s).level : 1);
    channel.postMessage({ type: 'preview-level', level: ((level ?? 1) + 1) % 10 });
    channel.close();
    showMessage(`已切换精灵预览等级`);
  };

  const resumePreview = () => {
    const channel = new BroadcastChannel('sprite-admin-preview');
    channel.postMessage({ type: 'preview-resume' });
    channel.close();
    showMessage(`已恢复精灵正常状态`);
  };

  const userId = myStatus?.hasSprite ? (myStatus as any)?.userId ?? '' : '';

  const handleGrantBeans = (amount: number) => {
    if (!userId) { showMessage('请先确保有精灵'); return; }
    grantBeansMutation.mutate({ userId, beans: amount });
  };

  const handleSetLevel = (level: number) => {
    if (!userId) { showMessage('请先确保有精灵'); return; }
    setLevelMutation.mutate({ userId, level });
  };

  const handleBuyItem = (code: string) => {
    buyItemMutation.mutate({ itemCode: code });
  };

  const handleUseItem = (code: string) => {
    useItemMutation.mutate({ itemCode: code });
  };

  const handleGrantTestItems = () => {
    if (!items || items.length === 0) return;
    grantTestItemsMutation.mutate({ itemCodes: items.map(i => i.code) });
  };

  const s = status as any;
  const hasSprite = s?.hasSprite && s?.isHatched;
  const ownedItems = myItems?.filter(i => (i.quantity ?? 0) > 0) || [];
  const totalBeanSpent = s?.totalBeanSpent ?? 0;
  const convertibleDays = Math.floor(totalBeanSpent / 100) - (s?.convertedDays ?? 0);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {message && (
        <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 text-center">
          {message}
        </div>
      )}

      {/* Current Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold mb-4">当前精灵状态</h3>
        {hasSprite ? (
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">等级</p>
              <p className="text-lg font-bold">Lv.{s?.level}</p>
            </div>
            <div>
              <p className="text-gray-500">精灵豆余额</p>
              <p className="text-lg font-bold text-amber-600">{s?.beanBalance ?? 0}</p>
            </div>
            <div>
              <p className="text-gray-500">已消耗精灵豆</p>
              <p className="text-lg font-bold text-green-700">{totalBeanSpent}</p>
            </div>
            <div>
              <p className="text-gray-500">可兑换VIP</p>
              <p className="text-lg font-bold text-purple-600">{Math.max(0, convertibleDays)} 天</p>
            </div>
            <div>
              <p className="text-gray-500">精灵经验</p>
              <p className="text-lg font-bold text-blue-700">{(s)?.totalXp ?? 0}</p>
            </div>
            <div>
              <p className="text-gray-500">仓库道具数</p>
              <p className="text-lg font-bold">{ownedItems.length}</p>
            </div>
            <div>
              <p className="text-gray-500">精灵系别</p>
              <p className="text-lg font-medium">{s?.species ?? '-'}</p>
            </div>
            <div>
              <p className="text-gray-500">精灵变体</p>
              <p className="text-lg font-medium">{s?.variant ?? '-'}</p>
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">精灵尚未孵化，请先完成新手引导</p>
        )}
      </div>

      {/* Level Control */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold mb-3">等级控制（升级/降级）</h3>
        <p className="text-xs text-gray-400 mb-3">设置后精灵等级立即变化，可观察不同等级的精灵形象和状态</p>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 10 }, (_, i) => (
            <button key={i} onClick={() => handleSetLevel(i)}
              disabled={!hasSprite || setLevelMutation.isPending}
              className={`px-3 py-2 text-sm rounded-lg border transition ${
                s?.level === i
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
              } disabled:opacity-50 disabled:cursor-not-allowed`}>
              L{i}
            </button>
          ))}
        </div>
      </div>

      {/* Bean Control */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold mb-3">精灵豆充值（测试用）</h3>
        <p className="text-xs text-gray-400 mb-3">给自己发放精灵豆，用于后续购买道具测试</p>
        <div className="flex flex-wrap gap-2">
          {[50, 100, 300, 500, 1000].map(amount => (
            <button key={amount} onClick={() => handleGrantBeans(amount)}
              disabled={!hasSprite || grantBeansMutation.isPending}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-400 transition disabled:opacity-50">
              +{amount} 豆
            </button>
          ))}
        </div>
      </div>

      {/* Shop - Buy Items */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold mb-3">商城购买（测试）</h3>
        <p className="text-xs text-gray-400 mb-3">模拟用户在前台商城购买道具，观察购买流程和经验值增长</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {items?.map(item => (
            <div key={item.code} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{item.icon}</span>
                <span className="text-sm font-medium">{item.name}</span>
              </div>
              <p className="text-xs text-gray-400 mb-2">{item.price} 豆 · 经验+{item.price}</p>
              <div className="flex gap-1">
                <button onClick={() => handleBuyItem(item.code)}
                  disabled={buyItemMutation.isPending || (s?.beanBalance ?? 0) < (item.price ?? 0)}
                  className="flex-1 px-2 py-1.5 bg-gray-900 text-white text-xs rounded hover:bg-gray-800 transition disabled:opacity-50">
                  购买
                </button>
                <button onClick={() => handleGrantTestItems()}
                  disabled={grantTestItemsMutation.isPending}
                  className="px-2 py-1.5 bg-blue-50 text-blue-600 text-xs rounded hover:bg-blue-100 transition disabled:opacity-50">
                  全发
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Inventory - Use Items */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold mb-3">道具仓库（使用测试）</h3>
        <p className="text-xs text-gray-400 mb-3">使用道具，观察经验值增长和精灵状态变化</p>
        {ownedItems.length > 0 ? (
          <div className="space-y-2">
            {ownedItems.map(item => (
              <div key={item.itemCode} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{item.detail?.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{item.detail?.name || item.itemCode}</p>
                    <p className="text-xs text-gray-400">持有 ×{item.quantity} · 经验 +{item.detail?.price ?? 0}</p>
                  </div>
                </div>
                <button onClick={() => handleUseItem(item.itemCode)}
                  disabled={useItemMutation.isPending}
                  className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition disabled:opacity-50">
                  使用
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-sm text-center py-4">仓库空空如也，先购买一些道具吧</p>
        )}
      </div>

      {/* Animation Control */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold mb-3">动画播放测试</h3>
        <p className="text-xs text-gray-400 mb-3">直接触发精灵的各种动画效果，观察表现</p>
        <div className="flex flex-wrap gap-2">
          {['sway', 'bounce', 'float', 'tilt', 'pulse', 'walk', 'play_alone', 'lie_rest', 'sleep', 'groom', 'click_surprise', 'tickled', 'level_up'].map(anim => (
            <button key={anim} onClick={() => triggerAnimation(anim)}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-400 transition">
              {anim}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={triggerLevelUp} className="px-3 py-1.5 text-xs rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 transition">
            升级预览
          </button>
          <button onClick={resumePreview} className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
            恢复正常
          </button>
        </div>
      </div>
    </div>
  );
}
