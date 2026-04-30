'use client';

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';

// ===== 关系类型定义 =====
// 人物关系类型
const CHARACTER_RELATIONS = ['盟友', '敌对', '朋友', '对手', '爱人', '师徒'];
// 势力关系类型
const FACTION_RELATIONS = ['盟友', '敌对', '竞争', '从属'];

// 关系颜色映射
const RELATION_COLORS: Record<string, string> = {
  '盟友': '#22c55e',
  '敌对': '#ef4444',
  '朋友': '#3b82f6',
  '对手': '#f97316',
  '爱人': '#ec4899',
  '师徒': '#06b6d4',
  '竞争': '#f59e0b',
  '从属': '#8b5cf6',
};

// 判断词条属于哪类图谱
function getEntryType(category: string): 'character' | 'faction' | null {
  const c = category.toLowerCase();
  if (c.includes('主角') || c.includes('人物') || c.includes('角色') || c.includes('反派') || c.includes('配角')) {
    return 'character';
  }
  if (c.includes('阵营') || c.includes('势力') || c.includes('组织') || c.includes('门派') || c.includes('家族')) {
    return 'faction';
  }
  return null;
}

interface SettingEntry {
  id: string;
  category: string;
  title: string;
  content: string;
}

interface GraphRelation {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
}

interface SettingRelationGraphProps {
  settings: SettingEntry[];
  relations: GraphRelation[];
  onCreateRelation?: (sourceId: string, targetId: string, relationType: string) => void;
  onDeleteRelation?: (id: string) => void;
  onGenerateEntries?: (characterText: string, factionText: string) => void;
  onClose: () => void;
}

export function SettingRelationGraph({
  settings,
  relations,
  onCreateRelation,
  onDeleteRelation,
  onGenerateEntries,
  onClose,
}: SettingRelationGraphProps) {
  // Tab: 人物关系 / 势力关系
  const [activeTab, setActiveTab] = useState<'character' | 'faction'>('character');

  // 分类过滤
  const characterEntries = useMemo(
    () => settings.filter(s => getEntryType(s.category) === 'character'),
    [settings],
  );
  const factionEntries = useMemo(
    () => settings.filter(s => getEntryType(s.category) === 'faction'),
    [settings],
  );
  const activeEntries = activeTab === 'character' ? characterEntries : factionEntries;
  const activeRelations = useMemo(
    () => {
      const entryIds = new Set(activeEntries.map(e => e.id));
      return relations.filter(r => entryIds.has(r.sourceId) && entryIds.has(r.targetId));
    },
    [relations, activeEntries],
  );

  // 当前图谱可用的关系类型
  const availableRelationTypes = activeTab === 'character' ? CHARACTER_RELATIONS : FACTION_RELATIONS;

  // 连线状态
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [showRelationPicker, setShowRelationPicker] = useState(false);
  const [customRelationType, setCustomRelationType] = useState('');
  const [selectedRelationTypes, setSelectedRelationTypes] = useState<string[]>([]);

  // SVG 拖拽
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [dragging, setDragging] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // 初始化节点位置（按类目分组排列）
  useEffect(() => {
    const initialNodes = new Map<string, { x: number; y: number }>();
    const svgW = 900;
    const svgH = 500;

    const groups: Record<string, SettingEntry[]> = {};
    activeEntries.forEach(s => {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    });
    const groupKeys = Object.keys(groups);
    if (groupKeys.length === 0) { setNodes(initialNodes); return; }

    const cols = Math.min(groupKeys.length, 3);
    const rows = Math.ceil(groupKeys.length / cols);
    const groupW = (svgW - 80) / cols;
    const groupH = (svgH - 60) / rows;

    groupKeys.forEach((cat, gi) => {
      const col = gi % cols;
      const row = Math.floor(gi / cols);
      const items = groups[cat];
      const startX = 40 + col * groupW + 20;
      const startY = 40 + row * groupH + 20;

      items.forEach((item, i) => {
        const x = startX + (i % 3) * 110;
        const y = startY + Math.floor(i / 3) * 60;
        initialNodes.set(item.id, { x: Math.min(x, svgW - 100), y: Math.min(y, svgH - 50) });
      });
    });
    setNodes(initialNodes);
  }, [activeEntries, activeTab]);

  // 拖拽
  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodes.get(nodeId);
    if (!node) return;
    setDragging(nodeId);
    dragOffset.current = { x: e.clientX - node.x, y: e.clientY - node.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const node = nodes.get(dragging);
    if (!node) return;
    setNodes(prev => new Map(prev).set(dragging, {
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y,
    }));
  };
  const handleMouseUp = () => setDragging(null);

  // 单击节点 — 连线逻辑
  const handleNodeClick = useCallback((nodeId: string) => {
    if (!selectedSource) {
      setSelectedSource(nodeId);
    } else if (selectedSource === nodeId) {
      setSelectedSource(null);
    } else {
      setPendingTarget(nodeId);
      setShowRelationPicker(true);
    }
  }, [selectedSource]);

  // 创建关系
  const handleCreateRelation = (types: string[]) => {
    if (!selectedSource || !pendingTarget) return;
    for (const t of types) {
      onCreateRelation?.(selectedSource, pendingTarget, t);
    }
    setSelectedSource(null);
    setPendingTarget(null);
    setShowRelationPicker(false);
    setSelectedRelationTypes([]);
    setCustomRelationType('');
  };

  // 检查同一对词条的关系数量
  const getPairRelationCount = (sourceId: string, targetId: string) => {
    return relations.filter(r => r.sourceId === sourceId && r.targetId === targetId).length;
  };

  // 生成关系文本
  const generateRelationText = (): { characterText: string; factionText: string } => {
    const entryMap = new Map<string, SettingEntry>();
    settings.forEach(s => entryMap.set(s.id, s));

    const charRelations: string[] = [];
    const factionRelations: string[] = [];

    relations.forEach(rel => {
      const src = entryMap.get(rel.sourceId);
      const tgt = entryMap.get(rel.targetId);
      if (!src || !tgt) return;
      const line = `${src.title} — ${tgt.title}：${rel.relationType}`;
      if (getEntryType(src.category) === 'character') {
        charRelations.push(line);
      } else if (getEntryType(src.category) === 'faction') {
        factionRelations.push(line);
      }
    });

    let characterText = '人物关系图谱\n';
    if (charRelations.length > 0) {
      characterText += charRelations.join('\n');
    } else {
      characterText += '（暂无人物关系）';
    }

    let factionText = '势力关系图谱\n';
    if (factionRelations.length > 0) {
      factionText += factionRelations.join('\n');
    } else {
      factionText += '（暂无势力关系）';
    }

    return { characterText, factionText };
  };

  // 确认并生成词条
  const handleConfirm = () => {
    const { characterText, factionText } = generateRelationText();
    onGenerateEntries?.(characterText, factionText);
  };

  // 关系颜色
  const getRelationColor = (type: string) => RELATION_COLORS[type] || '#6b7280';

  // 关系线中点
  const getMidpoint = (rel: GraphRelation) => {
    const src = nodes.get(rel.sourceId);
    const tgt = nodes.get(rel.targetId);
    if (!src || !tgt) return null;
    return { x: (src.x + tgt.x) / 2, y: (src.y + tgt.y) / 2 };
  };

  // 无词条时提示
  if (activeEntries.length === 0) {
    const label = activeTab === 'character' ? '人物类' : '势力类';
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-lg mx-4" onClick={e => e.stopPropagation()}>
          <h3 className="text-lg font-bold mb-3">设定关系图谱</h3>
          <p className="text-sm text-gray-500 mb-4">
            暂无{label}设定词条。请先创建{label}设定（如主角团、反派势力、阵营势力等类目）。
          </p>
          <button onClick={onClose} className="w-full py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
            关闭
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-4 w-full max-w-5xl shadow-lg mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold">设定关系图谱</h3>
            <p className="text-xs text-gray-400">
              单击词条选择源，再单击另一词条选择目标，弹出关系选择器
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleConfirm}
              className="px-4 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition">
              确认并生成词条
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => { setActiveTab('character'); setSelectedSource(null); setShowRelationPicker(false); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              activeTab === 'character'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            人物关系
            {characterEntries.length > 0 && (
              <span className="ml-1 text-xs opacity-70">({characterEntries.length})</span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab('faction'); setSelectedSource(null); setShowRelationPicker(false); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              activeTab === 'faction'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            势力关系
            {factionEntries.length > 0 && (
              <span className="ml-1 text-xs opacity-70">({factionEntries.length})</span>
            )}
          </button>
          <div className="flex gap-2 ml-auto items-center">
            {availableRelationTypes.map(t => (
              <div key={t} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getRelationColor(t) }} />
                <span className="text-xs text-gray-500">{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* SVG 关系图 */}
        <svg
          ref={svgRef}
          viewBox="0 0 900 500"
          className="w-full border border-gray-200 rounded-lg bg-gray-50 shrink-0"
          style={{ minHeight: '350px' }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <defs>
            {Object.entries(RELATION_COLORS).map(([key, color]) => (
              <marker key={key} id={`arrow-${activeTab}-${key}`} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill={color} />
              </marker>
            ))}
          </defs>

          {/* 连线 */}
          {activeRelations.map(rel => {
            const src = nodes.get(rel.sourceId);
            const tgt = nodes.get(rel.targetId);
            if (!src || !tgt) return null;
            const color = getRelationColor(rel.relationType);
            return (
              <g key={`${rel.sourceId}-${rel.targetId}-${rel.relationType}`}>
                <line
                  x1={src.x + 50} y1={src.y + 20}
                  x2={tgt.x + 50} y2={tgt.y + 20}
                  stroke={color}
                  strokeWidth={rel.relationType === '敌对' ? 2.5 : 2}
                  strokeDasharray={rel.relationType === '敌对' ? '6,4' : 'none'}
                  markerEnd={`url(#arrow-${activeTab}-${rel.relationType})`}
                />
                {(() => {
                  const mid = getMidpoint(rel);
                  if (!mid) return null;
                  return (
                    <g>
                      <rect x={mid.x - 20} y={mid.y - 9} width="40" height="16" rx="3" fill={color} opacity="0.85" />
                      <text x={mid.x} y={mid.y + 3} textAnchor="middle" fontSize="9" fill="white" fontWeight="500">
                        {rel.relationType}
                      </text>
                    </g>
                  );
                })()}
              </g>
            );
          })}

          {/* 节点 */}
          {activeEntries.map(s => {
            const pos = nodes.get(s.id);
            if (!pos) return null;
            const isSource = selectedSource === s.id;
            const isConnected = relations.some(r =>
              (r.sourceId === selectedSource && r.targetId === s.id) ||
              (r.targetId === selectedSource && r.sourceId === s.id)
            );
            const nodeColor = activeTab === 'character' ? '#3b82f6' : '#ef4444';

            return (
              <g key={s.id} className="cursor-grab active:cursor-grabbing">
                <rect
                  x={pos.x} y={pos.y}
                  width="100" height="40" rx="6"
                  fill={isSource ? '#fbbf24' : nodeColor}
                  stroke={isSource ? '#f59e0b' : 'white'}
                  strokeWidth={isSource ? 2.5 : 1}
                  onMouseDown={e => handleMouseDown(e, s.id)}
                  onClick={e => { e.stopPropagation(); handleNodeClick(s.id); }}
                />
                <text
                  x={pos.x + 50} y={pos.y + 17}
                  textAnchor="middle"
                  fontSize="12"
                  fill="white"
                  fontWeight="500"
                >
                  {s.title.length > 8 ? s.title.slice(0, 8) + '…' : s.title}
                </text>
                <text
                  x={pos.x + 50} y={pos.y + 32}
                  textAnchor="middle"
                  fontSize="9"
                  fill="white"
                  opacity="0.8"
                >
                  {s.category}
                </text>
                {isConnected && (
                  <circle cx={pos.x + 90} cy={pos.y} r="8" fill="#22c55e" stroke="white" strokeWidth="1.5" />
                )}
              </g>
            );
          })}
        </svg>

        {/* 关系选择器 */}
        {showRelationPicker && selectedSource && pendingTarget && (
          <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm font-medium mb-3">
              定义关系：
              <span className="text-blue-600">{settings.find(s => s.id === selectedSource)?.title || '?'}</span>
              <span className="mx-1 text-gray-400">↔</span>
              <span className="text-red-600">{settings.find(s => s.id === pendingTarget)?.title || '?'}</span>
            </p>

            {(() => {
              const count = getPairRelationCount(selectedSource, pendingTarget);
              const remaining = 3 - count;
              if (remaining <= 0) {
                return <p className="text-xs text-red-500 mb-2">该对词条已达到最大关系数（3个），请先删除已有关系</p>;
              }
              return <p className="text-xs text-gray-500 mb-2">还可设置 {remaining} 个关系类型</p>;
            })()}

            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-1.5">选择关系类型（可多选，最多3个）：</p>
              <div className="flex flex-wrap gap-2">
                {availableRelationTypes.map(t => {
                  const exists = relations.some(r =>
                    r.sourceId === selectedSource && r.targetId === pendingTarget && r.relationType === t
                  );
                  return (
                    <button
                      key={t}
                      onClick={() => {
                        if (exists) return;
                        if (selectedRelationTypes.includes(t)) {
                          setSelectedRelationTypes(prev => prev.filter(x => x !== t));
                        } else if (selectedRelationTypes.length < 3 - getPairRelationCount(selectedSource, pendingTarget)) {
                          setSelectedRelationTypes(prev => [...prev, t]);
                        }
                      }}
                      disabled={exists}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                        exists
                          ? 'bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed'
                          : selectedRelationTypes.includes(t)
                            ? 'text-white border-transparent'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                      }`}
                      style={selectedRelationTypes.includes(t) ? { backgroundColor: getRelationColor(t), color: 'white' } : {}}
                    >
                      {exists ? `${t} (已有)` : t}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 items-center mb-3">
              <span className="text-xs text-gray-500 shrink-0">自定义关系：</span>
              <input
                type="text"
                value={customRelationType}
                onChange={e => setCustomRelationType(e.target.value)}
                placeholder="输入自定义关系名称"
                className="flex-1 px-2 py-1 border rounded text-xs"
              />
              {customRelationType.trim() && (
                <button
                  onClick={() => {
                    if (selectedRelationTypes.includes(customRelationType.trim())) return;
                    if (selectedRelationTypes.length < 3 - getPairRelationCount(selectedSource, pendingTarget)) {
                      setSelectedRelationTypes(prev => [...prev, customRelationType.trim()]);
                    }
                    setCustomRelationType('');
                  }}
                  className="px-2 py-1 bg-gray-100 border rounded text-xs hover:bg-gray-200"
                >
                  添加
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleCreateRelation(selectedRelationTypes)}
                disabled={selectedRelationTypes.length === 0}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认（{selectedRelationTypes.length} 个关系）
              </button>
              <button
                onClick={() => { setSelectedSource(null); setPendingTarget(null); setShowRelationPicker(false); setSelectedRelationTypes([]); setCustomRelationType(''); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-100"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {selectedSource && !showRelationPicker && (
          <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            已选择「{settings.find(s => s.id === selectedSource)?.title}」，请单击另一个词条作为目标
            <button onClick={() => setSelectedSource(null)} className="ml-2 text-amber-500 underline">取消选择</button>
          </div>
        )}

        {activeRelations.length === 0 && !showRelationPicker && (
          <p className="text-center text-sm text-gray-400 py-3">
            暂无关系定义。单击两个词条可以创建关系。同一对词条最多同时设置三个关系类型。
          </p>
        )}
      </div>
    </div>
  );
}
