'use client';

import { useState, useCallback, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import spriteManifestStatic from '@/lib/sprite-manifest.json';
import { SpriteTextPanel } from './SpriteTextPanel';

const EXCLUDED_FOLDERS = ['common', 'items', 'effects', 'ui', 'placeholder', 'characters'];

const SPECIES_LABELS: Record<string, string> = {
  plant: '植物系',
  animal: '动物系',
  element: '元素系',
};

// ============================================================
// Tech specs (collapsible panels)
// ============================================================

const SPRITE_IMAGE_SPECS = `## 显示容器
- 固定 240×240px
- objectFit: contain 等比缩放

## 输出规范
- 格式：PNG，透明背景
- 画布尺寸：L0-L4 为 256×256px，L5-L9 为 512×512px
- 安全区域：内容不超过画布 70%，居中
- 命名：{species}_L{level}.png
- 存放：assets/sprites/{species}/{variant}/
- 通用精灵蛋：assets/sprites/common/universal_egg.png

## 动画空间预留
- egg-wobble：旋转±3° + 上下6px + 缩放1.02
- sprite-idle：上下6px + 缩放1.02
- sway：旋转±2°
- tilt：旋转±4°
- bounce：上下6px + 缩放1.02`;

const SPRITE_ANIMATION_SPECS = `## 动画资源规范
- 格式：PNG 序列帧（推荐）或 Lottie JSON
- 帧率：默认 6fps（舒缓节奏），最高 30fps
- idle 动画循环播放，upgrade/interact/special 不循环

## 文件路径架构

assets/sprites/{species}/{variant}/
├── {species}_L0.png ~ {species}_L9.png    ← 静态立绘
├── universal_egg.png                       ← 通用精灵蛋
└── animations/
    ├── L0/
    │   ├── slow_breath/frame_*.png         ← 缓慢呼吸，蛋体微光脉动
    │   └── level_up/frame_*.png            ← 破壳进化为L1
    ├── L1/
    │   ├── sway/frame_*.png                ← 站立轻微摇摆呼吸
    │   ├── walk/frame_*.png                ← 散步走动
    │   ├── play_alone/frame_*.png          ← 独自玩耍
    │   ├── lie_rest/frame_*.png            ← 躺下休息
    │   ├── lie_roll/frame_*.png            ← 躺下打滚
    │   ├── sleep/frame_*.png               ← 躺下睡觉
    │   ├── groom/frame_*.png               ← 梳理自身
    │   ├── click_surprise/frame_*.png      ← 左键点击：惊讶反应
    │   ├── click_relief/frame_*.png        ← 鼠标松开：平复
    │   ├── look_up_right/frame_*.png       ← 右键点击：向右上张望
    │   ├── look_relief/frame_*.png         ← 右键松开：回到初始
    │   ├── tickled/frame_*.png             ← 双击：被挠痒痒
    │   └── level_up/frame_*.png            ← 升级至下一形态
    ├── L2/    (同L1动作)
    ...
    └── L9/    (同L1动作)

## 动画名称与等级对应（新版统一命名）
| 动画名称 | 说明 | 可用等级 |
|----------|------|---------|
| slow_breath | L0 呼吸脉动 | L0 |
| level_up | 升级动画（破壳/进化） | 全等级 |
| sway | 站立轻微摇摆呼吸 | L1-L9 |
| walk | 散步走动 | L1-L9 |
| play_alone | 独自玩耍 | L1-L9 |
| lie_rest | 躺下休息 | L1-L9 |
| lie_roll | 躺下打滚 | L1-L9 |
| sleep | 躺下睡觉 | L1-L9 |
| groom | 梳理自身 | L1-L9 |
| click_surprise | 左键惊讶 | 交互 |
| click_relief | 左键平复 | 交互 |
| look_up_right | 右键张望 | 交互 |
| look_relief | 右键平复 | 交互 |
| tickled | 双击挠痒 | 交互 |

## 帧文件命名
- 文件名：frame_{序号}.png（如 frame_0.png、frame_1.png）
- 序号从 0 开始
- 每个动画子目录下至少 2 帧，推荐 12-24 帧

## 帧图片要求
- 格式：PNG，透明背景
- 尺寸：与同级立绘一致（L0-L4: 256×256, L5-L9: 512×512）
- 所有帧画布尺寸完全相同
- 精灵主体位置相对居中，相邻帧变化幅度≤10%

## 上传示例（太阳花L1待机摇摆）
1. 创建目录：assets/sprites/plant/sunflower/animations/L1/sway/
2. 放入帧文件：frame_0.png ~ frame_23.png（共 24 帧）
3. 管理后台点击"重新生成清单"
4. 进入 精灵 → 精灵动画 → 选择 plant/sunflower → 点击 L1 标签
5. 在 sway 卡片中预览动画效果

系统会从可用动画池中随机选择一个播放。
如某动画目录下无 PNG 帧文件，则回退为 CSS 动画。
如所有动画均无帧文件，则完全不播放动画。`;

const SHOP_ELEMENT_SPECS = `## 商城元素规范
- 商城面板背景：PNG 800×600px
- 道具专属形象：PNG 128×128px
- 命名：{item_code}-shop.png
- 存放：assets/sprites/items/shop/`;

const ITEM_ELEMENT_SPECS = `## 道具图标规范
- 道具图标：PNG 64×64px，透明背景
- 命名：{item_code}.png
- 存放：assets/sprites/items/icons/`;

/**
 * Show a confirmation dialog before executing a destructive action.
 */
function confirmAction(message: string): boolean {
  return window.confirm(message);
}

// ============================================================
// FileDropZone — internal component for drag-and-drop upload
// ============================================================

function FileDropZone({ targetPath, onFileUploaded, children }: {
  targetPath: string;
  onFileUploaded: (filename: string) => void;
  children?: React.ReactNode;
}) {
  const utils = trpc.useUtils();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<Record<string, number>>({}); // filename → progress %

  const uploadMutation = trpc.admin.files.uploadFile.useMutation({
    onSuccess: (data) => {
      onFileUploaded(data.path);
      utils.admin.files.scanPngs.invalidate({ basePath: targetPath });
      utils.admin.files.scanDirectory.invalidate();
    },
    onError: (e) => alert(`上传失败: ${e.message}`),
  });

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploading(prev => ({ ...prev, [file.name]: 10 }));

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data:image/png;base64, prefix
      const base64Data = result.split(',')[1] || result;
      setUploading(prev => ({ ...prev, [file.name]: 80 }));

      uploadMutation.mutate({
        basePath: targetPath,
        filename: file.name,
        base64Data,
        mimeType: file.type,
      });
    };
    reader.onerror = () => {
      setUploading(prev => {
        const next = { ...prev };
        delete next[file.name];
        return next;
      });
      alert(`读取文件失败: ${file.name}`);
    };
    reader.readAsDataURL(file);
  }, [targetPath]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!targetPath) { alert('请先选择目标目录'); return; }

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      await handleFile(file);
    }
  }, [targetPath, handleFile]);

  const handleSelectFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!targetPath) { alert('请先选择目标目录'); return; }
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      await handleFile(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [targetPath, handleFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-lg transition ${
        dragOver ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {children}
      {/* Upload overlay */}
      <div className="flex items-center justify-center gap-2 p-2">
        <label className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition cursor-pointer">
          选择文件
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleSelectFiles}
            className="hidden"
          />
        </label>
        <span className="text-xs text-gray-400">或拖拽文件到此处</span>
      </div>
      {/* Uploading progress */}
      {Object.keys(uploading).length > 0 && (
        <div className="px-2 pb-2 space-y-1">
          {Object.entries(uploading).map(([name, pct]) => (
            <div key={name} className="flex items-center gap-2 text-xs text-gray-500">
              <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-gray-900 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="truncate max-w-24">{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sprite Images Panel (精灵形象)
// ============================================================

function SpriteImagesPanel() {
  const utils = trpc.useUtils();
  const [selectedPath, setSelectedPath] = useState('');
  const [expandedSpecies, setExpandedSpecies] = useState<string | null>(null);
  const [showTechSpecs, setShowTechSpecs] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [createDialog, setCreateDialog] = useState(false);
  const [createType, setCreateType] = useState<'species' | 'variant' | 'custom'>('species');
  const [createName, setCreateName] = useState('');
  const [renameDialog, setRenameDialog] = useState<{ type: 'file' | 'folder'; path: string; currentName: string } | null>(null);
  const [renameNewName, setRenameNewName] = useState('');

  // Scan root level: get species directories
  const { data: rootScan } = trpc.admin.files.scanDirectory.useQuery(
    { basePath: '' },
    { refetchOnWindowFocus: false },
  );

  // Scan selected variant: get PNG files
  const { data: pngScan } = trpc.admin.files.scanPngs.useQuery(
    { basePath: selectedPath },
    { enabled: !!selectedPath, refetchOnWindowFocus: false },
  );

  // Manifest
  const { data: manifestData } = trpc.admin.files.getManifest.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );

  const regenerateManifest = trpc.admin.files.regenerateManifest.useMutation({
    onSuccess: () => {
      utils.admin.files.getManifest.invalidate();
      alert('清单已重新生成');
    },
    onError: (e) => alert(e.message),
  });

  const createDir = trpc.admin.files.createDirectory.useMutation({
    onSuccess: () => {
      utils.admin.files.scanDirectory.invalidate();
      setCreateDialog(false);
      setCreateName('');
    },
    onError: (e) => alert(e.message),
  });

  const uploadFile = trpc.admin.files.uploadFile.useMutation({
    onSuccess: () => {
      utils.admin.files.scanPngs.invalidate({ basePath: selectedPath });
      utils.admin.files.scanDirectory.invalidate();
    },
    onError: (e) => alert(e.message),
  });

  const deleteFile = trpc.admin.files.deleteFile.useMutation({
    onSuccess: () => {
      utils.admin.files.scanPngs.invalidate({ basePath: selectedPath });
      utils.admin.files.scanDirectory.invalidate();
    },
    onError: (e) => alert(e.message),
  });

  const deleteDirectory = trpc.admin.files.deleteDirectory.useMutation({
    onSuccess: () => {
      utils.admin.files.scanDirectory.invalidate();
      utils.admin.files.scanPngs.invalidate();
    },
    onError: (e) => alert(e.message),
  });

  const renamePath = trpc.admin.files.rename.useMutation({
    onSuccess: () => {
      utils.admin.files.scanDirectory.invalidate();
      utils.admin.files.scanPngs.invalidate();
    },
    onError: (e) => alert(e.message),
  });

  const openPath = trpc.admin.files.openPath.useQuery(
    { basePath: selectedPath || '' },
    { enabled: false },
  );

  const handleOpenPath = useCallback(() => {
    if (!selectedPath) return;
    // Query the path and open in system
    const result = openPath.refetch();
    result.then(r => {
      if (r.data?.osPath) {
        alert(`文件夹路径：${r.data.osPath}`);
      }
    });
  }, [selectedPath, openPath]);

  const handleCreateDir = () => {
    if (!createName) { alert('请输入名称'); return; }
    if (createType === 'species') {
      createDir.mutate({ basePath: createName });
    } else if (createType === 'variant') {
      if (!expandedSpecies) { alert('请先选择一个系别'); return; }
      createDir.mutate({ basePath: `${expandedSpecies}/${createName}` });
    } else {
      // Custom path: create arbitrary directory
      createDir.mutate({ basePath: createName });
    }
  };

  const speciesDirs = rootScan?.folders.filter(f => !EXCLUDED_FOLDERS.includes(f)) || [];

  return (
    <div>
      {/* Top action bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => { setCreateType('species'); setCreateDialog(true); }}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition"
          >
            + 新建系别
          </button>
          <button
            onClick={() => {
              if (!expandedSpecies) { alert('请先在左侧选择一个系别'); return; }
              setCreateType('variant');
              setCreateDialog(true);
            }}
            className="px-3 py-1.5 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition"
          >
            + 新建种类
          </button>
          <button
            onClick={() => { setCreateType('custom'); setCreateDialog(true); }}
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
          >
            + 自定义路径
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleOpenPath}
            disabled={!selectedPath}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-40 transition"
          >
            打开文件夹
          </button>
          <button
            onClick={() => regenerateManifest.mutate()}
            disabled={regenerateManifest.isPending}
            className="px-3 py-1.5 text-sm border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 disabled:opacity-40 transition"
          >
            {regenerateManifest.isPending ? '生成中...' : '重新生成清单'}
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Left: Folder tree */}
        <div className="w-64 shrink-0 bg-white rounded-xl border border-gray-200 p-3 max-h-[500px] overflow-y-auto">
          <div className="text-xs font-medium text-gray-500 mb-2">文件夹树</div>
          {speciesDirs.length === 0 && (
            <div className="text-sm text-gray-400 text-center py-4">暂无系别</div>
          )}
          {speciesDirs.map(species => (
            <div key={species}>
              <button
                onClick={() => setExpandedSpecies(expandedSpecies === species ? null : species)}
                className={`w-full text-left px-2 py-1.5 text-sm font-medium rounded transition ${
                  expandedSpecies === species ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
              >
                {SPECIES_LABELS[species] || species}
                <span className="text-xs text-gray-400 ml-1">({species})</span>
              </button>
              {expandedSpecies === species && (
                <div className="ml-3 mt-1">
                  <VariantFolderTree
                    species={species}
                    selectedPath={selectedPath}
                    onSelect={setSelectedPath}
                    onDelete={(path, name) => {
                      if (confirmAction(`确认删除文件夹「${name}」及其所有内容？此操作不可恢复。`)) {
                        deleteDirectory.mutate({ basePath: path, force: true });
                      }
                    }}
                    onRename={(path, name) => {
                      setRenameDialog({ type: 'folder', path, currentName: name });
                      setRenameNewName('');
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right: Content area */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 min-h-[400px]">
          {!selectedPath ? (
            <div className="text-sm text-gray-400 text-center py-12">
              请在左侧选择一个精灵种类查看图片
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-medium text-gray-700">{selectedPath}</span>
                  <span className="text-xs text-gray-400 ml-2">
                    {pngScan?.pngs.length || 0} 张图片
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-3">
                {Array.from({ length: 10 }).map((_, i) => {
                  const level = `L${i}`;
                  const existingFile = pngScan?.pngs.find(p => p.parsedLevel === i);
                  return (
                    <div key={level} className="text-center group">
                      <div className="text-xs text-gray-500 mb-1">{level}</div>
                      <div
                        className="w-24 h-24 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden cursor-pointer hover:border-gray-400 transition"
                        onClick={() => existingFile && setPreviewImage(`/assets/sprites/${selectedPath}/${existingFile.filename}`)}
                      >
                        {existingFile ? (
                          <img
                            src={`/assets/sprites/${selectedPath}/${existingFile.filename}`}
                            alt={level}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <label className="text-xs text-gray-300 hover:text-gray-500 cursor-pointer" title={`上传 ${level}`}>
                            <div>+</div>
                            <div>导入</div>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const result = reader.result as string;
                                  const base64Data = result.split(',')[1] || result;
                                  uploadFile.mutate({
                                    basePath: selectedPath,
                                    filename: file.name,
                                    base64Data,
                                    mimeType: file.type,
                                  });
                                };
                                reader.readAsDataURL(file);
                              }}
                            />
                          </label>
                        )}
                      </div>
                      {existingFile && (
                        <div className="text-[10px] text-gray-400 mt-1 truncate max-w-24 flex items-center justify-center gap-0.5" title={existingFile.filename}>
                          <span className="truncate">{existingFile.filename}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirmAction(`确认删除图片「${existingFile.filename}」？`)) {
                                deleteFile.mutate({ basePath: `${selectedPath}/${existingFile.filename}` });
                              }
                            }}
                            className="shrink-0 text-red-400 hover:text-red-600 hidden group-hover:block"
                            title="删除"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Bulk upload zone */}
              <div className="mt-4">
                <FileDropZone
                  targetPath={selectedPath}
                  onFileUploaded={() => {
                    utils.admin.files.scanPngs.invalidate({ basePath: selectedPath });
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Manifest preview */}
      {manifestData?.manifest && (
        <details className="mt-4 bg-white rounded-xl border border-gray-200">
          <summary className="px-4 py-2 text-sm font-medium text-gray-700 cursor-pointer">
            当前清单预览（{Object.keys(manifestData.manifest.sprites).length} 个精灵）
          </summary>
          <div className="px-4 pb-3">
            <pre className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg overflow-auto max-h-48">
              {JSON.stringify(manifestData.manifest, null, 2)}
            </pre>
          </div>
        </details>
      )}

      {/* Tech specs */}
      <details
        open={showTechSpecs}
        onToggle={e => setShowTechSpecs((e.target as HTMLDetailsElement).open)}
        className="mt-4 bg-white rounded-xl border border-gray-200"
      >
        <summary className="px-4 py-2 text-sm font-medium text-gray-700 cursor-pointer">
          精灵形象技术规范
        </summary>
        <div className="px-4 pb-4">
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded-lg">
            {SPRITE_IMAGE_SPECS}
          </pre>
        </div>
      </details>

      {/* Rename dialog */}
      {renameDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setRenameDialog(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">重命名{renameDialog.type === 'folder' ? '文件夹' : '文件'}</h3>
            <div className="text-xs text-gray-500 mb-2">当前名称：<code className="bg-gray-100 px-1 rounded">{renameDialog.currentName}</code></div>
            <input
              type="text"
              value={renameNewName}
              onChange={e => setRenameNewName(e.target.value)}
              placeholder="新名称"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              autoFocus
            />
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setRenameDialog(null)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                取消
              </button>
              <button
                onClick={() => {
                  if (!renameNewName) { alert('请输入新名称'); return; }
                  if (confirmAction(`确认将「${renameDialog.currentName}」重命名为「${renameNewName}」？`)) {
                    renamePath.mutate({ basePath: renameDialog.path, newName: renameNewName });
                    setRenameDialog(null);
                  }
                }}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create dialog */}
      {createDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setCreateDialog(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">
              {createType === 'custom' ? '自定义路径创建' : `新建${createType === 'species' ? '系别' : '种类'}文件夹`}
            </h3>
            {createType === 'variant' && expandedSpecies && (
              <div className="text-xs text-gray-500 mb-2">父目录：{expandedSpecies}</div>
            )}
            {createType === 'custom' && (
              <div className="text-xs text-gray-500 mb-2">
                输入任意路径，如 <code className="bg-gray-100 px-1 rounded">plant/sunflower/animations/idle/sway</code>
              </div>
            )}
            <input
              type="text"
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              placeholder={
                createType === 'species' ? '例：mythical' :
                createType === 'variant' ? '例：dragon' :
                '例：plant/sunflower/animations/idle/sway'
              }
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              autoFocus
            />
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setCreateDialog(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                取消
              </button>
              <button onClick={handleCreateDir} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800">
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image preview modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="preview" className="max-w-[80vw] max-h-[80vh] object-contain" />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Animation Subdir Card + Frame Player
// ============================================================

function AnimSubdirCard({ name, framesPath, onPlay, onStop, isPlaying, onUploadFrames }: {
  name: string;
  framesPath: string;
  onPlay: (frames: string[], fps: number) => void;
  onStop: () => void;
  isPlaying: boolean;
  onUploadFrames: (basePath: string, files: FileList | File[]) => void;
}) {
  const { data: framesData } = trpc.admin.files.scanPngs.useQuery(
    { basePath: framesPath },
    { refetchOnWindowFocus: false },
  );

  const frameFiles = (framesData?.pngs || [])
    .filter(p => p.filename.match(/^frame_\d+\.png$/i))
    .sort((a, b) => a.filename.localeCompare(b.filename));

  const thumbnailFrames = frameFiles.slice(0, 8);
  const frameUrls = thumbnailFrames.map(f => `/assets/sprites/${framesPath}/${f.filename}`);

  const handlePlay = () => {
    const allUrls = frameFiles.map(f => `/assets/sprites/${framesPath}/${f.filename}`);
    if (allUrls.length > 0) {
      onPlay(allUrls, 12);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onUploadFrames(framesPath, files);
    }
  };

  return (
    <div
      className="border border-gray-200 rounded-lg p-3 hover:border-gray-400 transition cursor-pointer"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{name}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{frameFiles.length} 帧</span>
          <label
            className="px-2 py-0.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-800 cursor-pointer transition"
            onClick={(e) => e.stopPropagation()}
          >
            导入帧
            <input
              type="file"
              multiple
              accept="image/png"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onUploadFrames(framesPath, e.target.files);
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>
      {thumbnailFrames.length > 0 ? (
        <div className="grid grid-cols-4 gap-1" onClick={handlePlay}>
          {frameUrls.map((url, i) => (
            <div key={i} className="w-full aspect-square bg-gray-50 rounded border border-gray-100 overflow-hidden">
              <img src={url} alt={`frame ${i}`} className="w-full h-full object-contain" />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-gray-300 text-center py-2">拖拽或点击导入帧</div>
      )}
    </div>
  );
}

function FramePlayer({ frames, fps }: { frames: string[]; fps: number }) {
  const [currentFrame, setCurrentFrame] = useState(0);

  useEffect(() => {
    if (frames.length === 0) return;
    const interval = 1000 / fps;
    const timer = setInterval(() => {
      setCurrentFrame(prev => (prev + 1) % frames.length);
    }, interval);
    return () => clearInterval(timer);
  }, [frames.length, fps]);

  if (frames.length === 0) return null;

  return (
    <img
      src={frames[currentFrame]}
      alt="frame player"
      className="w-full h-full object-contain"
    />
  );
}

// ============================================================
// Variant Folder Tree (inner component)
// ============================================================

function VariantFolderTree({ species, selectedPath, onSelect, onDelete, onRename }: {
  species: string;
  selectedPath: string;
  onSelect: (path: string) => void;
  onDelete?: (path: string, name: string) => void;
  onRename?: (path: string, name: string) => void;
}) {
  const { data: speciesScan } = trpc.admin.files.scanDirectory.useQuery(
    { basePath: species },
    { refetchOnWindowFocus: false },
  );

  const variantDirs = speciesScan?.folders || [];

  return (
    <div>
      {variantDirs.map(variant => {
        const fullPath = `${species}/${variant}`;
        return (
          <div key={variant} className="group flex items-center">
            <button
              onClick={() => onSelect(fullPath)}
              className={`flex-1 text-left px-2 py-1 text-sm rounded transition truncate ${
                selectedPath === fullPath
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {variant}
            </button>
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(fullPath, variant); }}
                className="hidden group-hover:flex shrink-0 mr-1 px-1 py-0.5 text-xs text-red-500 hover:bg-red-50 rounded transition"
                title="删除"
              >
                ✕
              </button>
            )}
            {onRename && (
              <button
                onClick={(e) => { e.stopPropagation(); onRename(fullPath, variant); }}
                className="hidden group-hover:flex shrink-0 px-1 py-0.5 text-xs text-gray-400 hover:bg-gray-100 rounded transition"
                title="重命名"
              >
                ✎
              </button>
            )}
          </div>
        );
      })}
      {variantDirs.length === 0 && (
        <div className="text-xs text-gray-400 py-1">暂无种类</div>
      )}
    </div>
  );
}

// ============================================================
// Sprite Animations Panel (精灵动画)
// ============================================================

function SpriteAnimationsPanel() {
  const utils = trpc.useUtils();
  const [selectedPath, setSelectedPath] = useState('');
  const [expandedSpecies, setExpandedSpecies] = useState<string | null>(null);
  const [showTechSpecs, setShowTechSpecs] = useState(false);
  const [playingAnim, setPlayingAnim] = useState<string | null>(null);
  const [playingFrames, setPlayingFrames] = useState<string[]>([]);
  const [playingFps, setPlayingFps] = useState(12);

  // New animation directory dialog
  const [newAnimDialog, setNewAnimDialog] = useState(false);
  const [animLevel, setAnimLevel] = useState(1);
  const [animCategory, setAnimCategory] = useState<'idle' | 'special'>('idle');
  const [animName, setAnimName] = useState('');

  // Animation dropdown: auto-detected across all levels
  const [selectedAnimDropdown, setSelectedAnimDropdown] = useState<string | null>(null);
  const [selectedAnimLevelForPreview, setSelectedAnimLevelForPreview] = useState<string>('');

  // Use runtime manifest via tRPC instead of static import
  const { data: manifestData } = trpc.admin.files.getManifest.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );

  const LEVEL_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
    value: i,
    label: i === 0 ? 'L0（精灵蛋）' : `L${i}（${
      i === 1 ? '幼年期' : i <= 2 ? '成长期' : i <= 4 ? '成熟期' : i <= 7 ? '完全体' : '终极形态'
    }）`,
  }));

  const { data: rootScan } = trpc.admin.files.scanDirectory.useQuery(
    { basePath: '' },
    { refetchOnWindowFocus: false },
  );

  // When a variant is selected, scan its animations directory for level folders
  const animationsPath = selectedPath ? `${selectedPath}/animations` : '';
  const { data: animScan } = trpc.admin.files.scanDirectory.useQuery(
    { basePath: animationsPath },
    { enabled: !!selectedPath, refetchOnWindowFocus: false },
  );

  // Filter level folders (L0-L9)
  const allLevelFolders = (animScan?.folders || []).filter(f => /^L\d+$/.test(f)).sort();

  // Auto-detect all animations across all levels using runtime manifest data
  const spriteManifest = manifestData?.manifest || spriteManifestStatic;
  const parts = selectedPath ? selectedPath.split('/') : [];
  const manifestVariant = parts.length >= 2
    ? (spriteManifest.sprites as any)?.[parts[0]]?.[parts[1]]
    : null;
  const manifestFrames = manifestVariant?.frames || {};
  const manifestAnimNames = Object.keys(manifestFrames).sort();

  // Combined animation names (manifest + could add filesystem scan later)
  const allAnimNamesFromManifest = [...new Set(manifestAnimNames)].sort();

  // Build a map: animName -> levels it exists in (from manifest frames paths)
  const animLevelMap: Record<string, string[]> = {};
  for (const [animName, animData] of Object.entries(manifestFrames)) {
    const data = animData as any;
    if (data.frames && data.frames.length > 0) {
      // Extract level from path: /assets/sprites/.../animations/L{N}/animName/
      const levels = new Set<string>();
      for (const framePath of data.frames) {
        const match = framePath.match(/\/animations\/(L\d+)\//);
        if (match) levels.add(match[1]);
      }
      animLevelMap[animName] = [...levels].sort();
    }
  }

  // Update selectedAnimDropdown when animations change
  if (selectedAnimDropdown && !allAnimNamesFromManifest.includes(selectedAnimDropdown)) {
    setSelectedAnimDropdown(allAnimNamesFromManifest[0] || null);
  }
  if (!selectedAnimDropdown && allAnimNamesFromManifest.length > 0) {
    setSelectedAnimDropdown(allAnimNamesFromManifest[0]);
  }

  // Find which levels contain the selected animation
  const levelsForSelectedAnim = selectedAnimDropdown ? (animLevelMap[selectedAnimDropdown] || []) : [];

  // Scan frames for the selected animation (use first available level if not explicitly selected)
  const animLevelForFrames = selectedAnimLevelForPreview || levelsForSelectedAnim[0] || '';
  const animFramesPath = (selectedAnimDropdown && animLevelForFrames)
    ? `${selectedPath}/animations/${animLevelForFrames}/${selectedAnimDropdown}`
    : '';
  const { data: animFramesScan } = trpc.admin.files.scanPngs.useQuery(
    { basePath: animFramesPath },
    { enabled: !!selectedAnimDropdown && !!animLevelForFrames, refetchOnWindowFocus: false },
  );

  // Scan individual level directory for idle/ and special/ categories
  const [selectedLevel, setSelectedLevel] = useState('');
  const levelPath = selectedLevel ? `${selectedPath}/animations/${selectedLevel}` : '';
  const { data: levelDirScan } = trpc.admin.files.scanDirectory.useQuery(
    { basePath: levelPath },
    { enabled: !!selectedLevel, refetchOnWindowFocus: false },
  );

  // Detect structure: does this level have idle/ and special/ subdirectories?
  const levelFolders = (levelDirScan?.folders || []);
  const hasIdleCategory = levelFolders.includes('idle');
  const hasSpecialCategory = levelFolders.includes('special');

  // Scan idle animations
  const idlePath = hasIdleCategory ? `${selectedPath}/animations/${selectedLevel}/idle` : '';
  const { data: idleScan } = trpc.admin.files.scanDirectory.useQuery(
    { basePath: idlePath },
    { enabled: hasIdleCategory, refetchOnWindowFocus: false },
  );

  // Scan special animations
  const specialPath = hasSpecialCategory ? `${selectedPath}/animations/${selectedLevel}/special` : '';
  const { data: specialScan } = trpc.admin.files.scanDirectory.useQuery(
    { basePath: specialPath },
    { enabled: hasSpecialCategory, refetchOnWindowFocus: false },
  );

  // Fallback: old flat structure (no idle/special categories)
  const flatAnimNames = (!hasIdleCategory && !hasSpecialCategory) ? levelFolders : [];

  // Active category tab
  const [activeCategory, setActiveCategory] = useState<'idle' | 'special'>('idle');

  // Current animations to display based on active category
  const currentAnims = activeCategory === 'idle'
    ? (idleScan?.folders || [])
    : (specialScan?.folders || []);
  const currentCategoryPath = activeCategory === 'idle' ? idlePath : specialPath;

  // Scan frames in a subdirectory (uses category structure if applicable)
  const [selectedSubdir, setSelectedSubdir] = useState('');
  const framesPath = selectedSubdir
    ? (hasIdleCategory || hasSpecialCategory)
      ? `${selectedPath}/animations/${selectedLevel}/${activeCategory}/${selectedSubdir}`
      : `${selectedPath}/animations/${selectedLevel}/${selectedSubdir}`
    : '';
  const { data: framesScan } = trpc.admin.files.scanPngs.useQuery(
    { basePath: framesPath },
    { enabled: !!selectedSubdir, refetchOnWindowFocus: false },
  );

  const regenerateManifest = trpc.admin.files.regenerateManifest.useMutation({
    onSuccess: () => {
      utils.admin.files.getManifest.invalidate();
      utils.admin.files.scanDirectory.invalidate();
      utils.admin.files.scanPngs.invalidate();
      alert('清单已重新生成');
    },
    onError: (e) => alert(e.message),
  });

  const createAnimDir = trpc.admin.files.createDirectory.useMutation({
    onSuccess: () => {
      utils.admin.files.scanDirectory.invalidate();
      setNewAnimDialog(false);
      setAnimName('');
    },
    onError: (e) => alert(e.message),
  });

  const uploadAnimFrame = trpc.admin.files.uploadFile.useMutation({
    onSuccess: () => {
      utils.admin.files.scanPngs.invalidate();
      utils.admin.files.scanDirectory.invalidate();
    },
    onError: (e) => alert(e.message),
  });

  const deleteAnimDirectory = trpc.admin.files.deleteDirectory.useMutation({
    onSuccess: () => {
      utils.admin.files.scanDirectory.invalidate();
      utils.admin.files.scanPngs.invalidate();
    },
    onError: (e) => alert(e.message),
  });

  const renameAnimPath = trpc.admin.files.rename.useMutation({
    onSuccess: () => {
      utils.admin.files.scanDirectory.invalidate();
      utils.admin.files.scanPngs.invalidate();
    },
    onError: (e) => alert(e.message),
  });

  const deleteAnimFrame = trpc.admin.files.deleteFile.useMutation({
    onSuccess: () => {
      utils.admin.files.scanPngs.invalidate();
      utils.admin.files.scanDirectory.invalidate();
    },
    onError: (e) => alert(e.message),
  });

  const handleCreateAnimDir = () => {
    if (!selectedPath) { alert('请先选择精灵种类'); return; }
    if (!animName) { alert('请输入动画名称'); return; }
    const basePath = `${selectedPath}/animations/L${animLevel}/${animCategory}/${animName}`;
    createAnimDir.mutate({ basePath });
  };

  const handleUploadFrames = async (basePath: string, files: FileList | File[]) => {
    const fileArray = Array.isArray(files) ? files : Array.from(files);
    for (const file of fileArray) {
      if (!file.name.toLowerCase().endsWith('.png')) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1] || result;
        uploadAnimFrame.mutate({
          basePath,
          filename: file.name,
          base64Data,
          mimeType: file.type,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const speciesDirs = rootScan?.folders.filter(f => !EXCLUDED_FOLDERS.includes(f)) || [];

  // Play frame animation
  const playAnimation = (frames: string[], fps: number) => {
    setPlayingFrames(frames);
    setPlayingFps(fps);
    setPlayingAnim(frames.join(','));
  };

  const stopAnimation = () => {
    setPlayingAnim(null);
    setPlayingFrames([]);
  };

  const [testLevel, setTestLevel] = useState(1); // For testing animations at different levels
  const [animRenameDialog, setAnimRenameDialog] = useState<{ type: 'folder' | 'file'; path: string; currentName: string } | null>(null);
  const [animRenameNewName, setAnimRenameNewName] = useState('');

  return (
    <div>
      {/* Top action bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2 items-center">
          <div className="text-sm text-gray-500">选择精灵种类查看动画资产</div>
          <button
            onClick={() => {
              if (!selectedPath) { alert('请先在左侧选择一个精灵种类'); return; }
              setNewAnimDialog(true);
            }}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition"
          >
            + 新建动画目录
          </button>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500">测试等级:</span>
          <select
            value={testLevel}
            onChange={e => setTestLevel(Number(e.target.value))}
            className="px-2 py-1 text-xs border rounded"
          >
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i} value={i}>L{i}</option>
            ))}
          </select>
          <button
            onClick={() => regenerateManifest.mutate()}
            disabled={regenerateManifest.isPending}
            className="px-3 py-1.5 text-sm border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 disabled:opacity-40 transition"
          >
            {regenerateManifest.isPending ? '生成中...' : '重新生成清单'}
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Left: Folder tree */}
        <div className="w-64 shrink-0 bg-white rounded-xl border border-gray-200 p-3 max-h-[500px] overflow-y-auto">
          <div className="text-xs font-medium text-gray-500 mb-2">精灵目录</div>
          {speciesDirs.map(species => (
            <div key={species}>
              <button
                onClick={() => setExpandedSpecies(expandedSpecies === species ? null : species)}
                className={`w-full text-left px-2 py-1.5 text-sm font-medium rounded transition ${
                  expandedSpecies === species ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
              >
                {SPECIES_LABELS[species] || species}
              </button>
              {expandedSpecies === species && (
                <div className="ml-3 mt-1">
                  <AnimVariantTree
                    species={species}
                    selectedPath={selectedPath}
                    onSelect={setSelectedPath}
                    onDelete={(path, name) => {
                      if (confirmAction(`确认删除文件夹「${name}」及其所有内容？此操作不可恢复。`)) {
                        deleteAnimDirectory.mutate({ basePath: path, force: true });
                      }
                    }}
                    onRename={(path, name) => {
                      setAnimRenameDialog({ type: 'folder', path, currentName: name });
                      setAnimRenameNewName('');
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right: Animation levels + frames */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 min-h-[400px]">
          {!selectedPath ? (
            <div className="text-sm text-gray-400 text-center py-12">请选择精灵种类查看动画</div>
          ) : levelFolders.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-12">
              该精灵暂无动画文件夹<br />
              <span className="text-xs">路径：{animationsPath}</span>
            </div>
          ) : (
            <>
              {/* Level tabs */}
              <div className="flex gap-2 mb-4 flex-wrap">
                {levelFolders.map(folder => (
                  <button
                    key={folder}
                    onClick={() => { setSelectedLevel(folder); setSelectedSubdir(''); }}
                    className={`px-3 py-1.5 text-sm rounded-full border transition ${
                      selectedLevel === folder
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'hover:border-gray-500'
                    }`}
                  >
                    {folder}
                  </button>
                ))}
              </div>

              {/* Animation cards for selected level */}
              {selectedLevel && (
                <div>
                  {/* Animation dropdown selector */}
                  {allAnimNamesFromManifest.length > 0 && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-medium text-gray-500">动画切换:</span>
                        <select
                          value={selectedAnimDropdown || ''}
                          onChange={(e) => {
                            setSelectedAnimDropdown(e.target.value);
                            setSelectedAnimLevelForPreview('');
                          }}
                          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                        >
                          {allAnimNamesFromManifest.map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                        {levelsForSelectedAnim.length > 1 && (
                          <select
                            value={selectedAnimLevelForPreview}
                            onChange={(e) => setSelectedAnimLevelForPreview(e.target.value)}
                            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                          >
                            <option value="">自动</option>
                            {levelsForSelectedAnim.map(l => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                        )}
                        <span className="text-xs text-gray-400">
                          存在于: {levelsForSelectedAnim.join(', ')}
                        </span>
                      </div>

                      {/* Quick preview of selected animation */}
                      {selectedAnimDropdown && animFramesScan?.pngs && animFramesScan.pngs.length > 0 && (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              const frames = animFramesScan.pngs.map(p => `/assets/sprites/${animFramesPath}/${p.filename}`);
                              const fps = manifestFrames[selectedAnimDropdown]?.fps || 6;
                              playAnimation(frames, fps);
                            }}
                            className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-800 transition"
                          >
                            ▶ 播放此动画
                          </button>
                          <span className="text-xs text-gray-500">
                            {animFramesScan.pngs.length} 帧
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Category tabs: idle / special */}
                  {(hasIdleCategory || hasSpecialCategory) && (
                    <div className="flex gap-2 mb-3">
                      {hasIdleCategory && (
                        <button
                          onClick={() => { setActiveCategory('idle'); setSelectedSubdir(''); }}
                          className={`px-3 py-1.5 text-sm rounded-full border transition ${
                            activeCategory === 'idle'
                              ? 'border-green-600 bg-green-600 text-white'
                              : 'hover:border-gray-500'
                          }`}
                        >
                          待机动画 ({(idleScan?.folders || []).length})
                        </button>
                      )}
                      {hasSpecialCategory && (
                        <button
                          onClick={() => { setActiveCategory('special'); setSelectedSubdir(''); }}
                          className={`px-3 py-1.5 text-sm rounded-full border transition ${
                            activeCategory === 'special'
                              ? 'border-amber-600 bg-amber-600 text-white'
                              : 'hover:border-gray-500'
                          }`}
                        >
                          特殊动画 ({(specialScan?.folders || []).length})
                        </button>
                      )}
                    </div>
                  )}

                  <div className="text-xs text-gray-500 mb-3">
                    {selectedLevel} — {currentAnims.length} 个{activeCategory === 'idle' ? '待机' : '特殊'}动画
                    {allAnimNamesFromManifest.length > 0 && (
                      <span className="ml-2 text-blue-600">
                        · 共检测到 {allAnimNamesFromManifest.length} 种动画类型
                      </span>
                    )}
                  </div>

                  {(hasIdleCategory || hasSpecialCategory) && currentAnims.length === 0 && (
                    <div className="text-sm text-gray-400 text-center py-8">
                      此分类下暂无动画
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {currentAnims.map(subdir => {
                      const subdirFramesPath = hasIdleCategory || hasSpecialCategory
                        ? `${selectedPath}/animations/${selectedLevel}/${activeCategory}/${subdir}`
                        : `${selectedPath}/animations/${selectedLevel}/${subdir}`;
                      return (
                        <div key={subdir} className="group relative">
                          {/* Delete + Rename buttons overlay */}
                          <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={() => {
                                setAnimRenameDialog({ type: 'folder', path: subdirFramesPath, currentName: subdir });
                                setAnimRenameNewName('');
                              }}
                              className="px-1.5 py-0.5 text-xs bg-white/90 text-gray-600 rounded shadow hover:bg-gray-100 transition"
                              title="重命名"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => {
                                if (confirmAction(`确认删除动画「${subdir}」及其所有帧文件？此操作不可恢复。`)) {
                                  deleteAnimDirectory.mutate({ basePath: subdirFramesPath, force: true });
                                }
                              }}
                              className="px-1.5 py-0.5 text-xs bg-white/90 text-red-500 rounded shadow hover:bg-red-50 transition"
                              title="删除"
                            >
                              ✕
                            </button>
                          </div>
                          <AnimSubdirCard
                            name={subdir}
                            framesPath={subdirFramesPath}
                            onPlay={playAnimation}
                            onStop={stopAnimation}
                            isPlaying={playingAnim !== null}
                            onUploadFrames={handleUploadFrames}
                          />
                        </div>
                      );
                    })}

                    {/* Fallback: flat structure (old format) */}
                    {flatAnimNames.map(subdir => {
                      const subdirFramesPath = `${selectedPath}/animations/${selectedLevel}/${subdir}`;
                      return (
                        <div key={subdir} className="group relative">
                          <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={() => {
                                setAnimRenameDialog({ type: 'folder', path: subdirFramesPath, currentName: subdir });
                                setAnimRenameNewName('');
                              }}
                              className="px-1.5 py-0.5 text-xs bg-white/90 text-gray-600 rounded shadow hover:bg-gray-100 transition"
                              title="重命名"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => {
                                if (confirmAction(`确认删除动画「${subdir}」及其所有帧文件？此操作不可恢复。`)) {
                                  deleteAnimDirectory.mutate({ basePath: subdirFramesPath, force: true });
                                }
                              }}
                              className="px-1.5 py-0.5 text-xs bg-white/90 text-red-500 rounded shadow hover:bg-red-50 transition"
                              title="删除"
                            >
                              ✕
                            </button>
                          </div>
                          <AnimSubdirCard
                            name={subdir}
                            framesPath={subdirFramesPath}
                            onPlay={playAnimation}
                            onStop={stopAnimation}
                            isPlaying={playingAnim !== null}
                            onUploadFrames={handleUploadFrames}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Frame preview player */}
      {playingAnim && playingFrames.length > 0 && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">帧序列预览</span>
            <button onClick={stopAnimation} className="text-xs px-2 py-1 border rounded hover:bg-gray-50">
              停止
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
              <FramePlayer frames={playingFrames} fps={playingFps} />
            </div>
            <div className="text-xs text-gray-500">
              <div>{playingFrames.length} 帧</div>
              <div>{playingFps} fps</div>
              <div>循环播放中</div>
            </div>
          </div>
        </div>
      )}

      {/* Tech specs */}
      <details
        open={showTechSpecs}
        onToggle={e => setShowTechSpecs((e.target as HTMLDetailsElement).open)}
        className="mt-4 bg-white rounded-xl border border-gray-200"
      >
        <summary className="px-4 py-2 text-sm font-medium text-gray-700 cursor-pointer">
          精灵动画技术规范
        </summary>
        <div className="px-4 pb-4">
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded-lg">
            {SPRITE_ANIMATION_SPECS}
          </pre>
        </div>
      </details>

      {/* New animation directory dialog */}
      {newAnimDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setNewAnimDialog(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">新建动画目录</h3>
            <div className="text-xs text-gray-500 mb-2">目标路径：{selectedPath}/animations/</div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">动画等级</label>
                <select
                  value={animLevel}
                  onChange={e => setAnimLevel(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  {LEVEL_OPTIONS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">动画分类</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAnimCategory('idle')}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition ${
                      animCategory === 'idle'
                        ? 'border-green-600 bg-green-50 text-green-700'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    待机（循环）
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnimCategory('special')}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition ${
                      animCategory === 'special'
                        ? 'border-amber-600 bg-amber-50 text-amber-700'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    特殊（非循环）
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">动画名称</label>
                <input
                  type="text"
                  value={animName}
                  onChange={e => setAnimName(e.target.value)}
                  placeholder={animCategory === 'idle' ? '例：sway-breathe' : '例：click-surprise'}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  autoFocus
                />
              </div>
              {animName && (
                <div className="text-xs text-gray-400">
                  将创建：{selectedPath}/animations/L{animLevel}/{animCategory}/{animName}/
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setNewAnimDialog(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                取消
              </button>
              <button
                onClick={handleCreateAnimDir}
                disabled={createAnimDir.isPending}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animation rename dialog */}
      {animRenameDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setAnimRenameDialog(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">重命名{animRenameDialog.type === 'folder' ? '文件夹' : '文件'}</h3>
            <div className="text-xs text-gray-500 mb-2">当前名称：<code className="bg-gray-100 px-1 rounded">{animRenameDialog.currentName}</code></div>
            <input
              type="text"
              value={animRenameNewName}
              onChange={e => setAnimRenameNewName(e.target.value)}
              placeholder="新名称"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              autoFocus
            />
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setAnimRenameDialog(null)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                取消
              </button>
              <button
                onClick={() => {
                  if (!animRenameNewName) { alert('请输入新名称'); return; }
                  if (confirmAction(`确认将「${animRenameDialog.currentName}」重命名为「${animRenameNewName}」？`)) {
                    renameAnimPath.mutate({ basePath: animRenameDialog.path, newName: animRenameNewName });
                    setAnimRenameDialog(null);
                  }
                }}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AnimVariantTree({ species, selectedPath, onSelect, onDelete, onRename }: {
  species: string;
  selectedPath: string;
  onSelect: (path: string) => void;
  onDelete?: (path: string, name: string) => void;
  onRename?: (path: string, name: string) => void;
}) {
  const { data: speciesScan } = trpc.admin.files.scanDirectory.useQuery(
    { basePath: species },
    { refetchOnWindowFocus: false },
  );

  const variantDirs = speciesScan?.folders || [];

  return (
    <div>
      {variantDirs.map(variant => {
        const fullPath = `${species}/${variant}`;
        return (
          <div key={variant} className="group flex items-center">
            <button
              onClick={() => onSelect(fullPath)}
              className={`flex-1 text-left px-2 py-1 text-sm rounded transition truncate ${
                selectedPath === fullPath
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {variant}
            </button>
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(fullPath, variant); }}
                className="hidden group-hover:flex shrink-0 mr-1 px-1 py-0.5 text-xs text-red-500 hover:bg-red-50 rounded transition"
                title="删除"
              >
                ✕
              </button>
            )}
            {onRename && (
              <button
                onClick={(e) => { e.stopPropagation(); onRename(fullPath, variant); }}
                className="hidden group-hover:flex shrink-0 px-1 py-0.5 text-xs text-gray-400 hover:bg-gray-100 rounded transition"
                title="重命名"
              >
                ✎
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Shop Elements Panel (商城元素)
// ============================================================

function ShopElementsPanel() {
  const [showTechSpecs, setShowTechSpecs] = useState(false);
  const shopPath = 'items/shop';

  const { data: shopScan } = trpc.admin.files.scanPngs.useQuery(
    { basePath: shopPath },
    { refetchOnWindowFocus: false },
  );

  const regenerateManifest = trpc.admin.files.regenerateManifest.useMutation({
    onSuccess: () => alert('清单已重新生成'),
    onError: (e) => alert(e.message),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-500">路径：{shopPath}</div>
        <button
          onClick={() => regenerateManifest.mutate()}
          disabled={regenerateManifest.isPending}
          className="px-3 py-1.5 text-sm border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 disabled:opacity-40 transition"
        >
          重新生成清单
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 min-h-[300px]">
        {!shopScan?.pngs?.length ? (
          <div className="text-sm text-gray-400 text-center py-12">暂无商城元素图片</div>
        ) : (
          <div className="grid grid-cols-6 gap-3">
            {shopScan.pngs.map(png => (
              <div key={png.filename} className="text-center">
                <div className="w-24 h-24 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden mx-auto">
                  <img
                    src={`/assets/sprites/${shopPath}/${png.filename}`}
                    alt={png.filename}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="text-[10px] text-gray-400 mt-1 truncate max-w-24" title={png.filename}>
                  {png.filename}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tech specs */}
      <details
        open={showTechSpecs}
        onToggle={e => setShowTechSpecs((e.target as HTMLDetailsElement).open)}
        className="mt-4 bg-white rounded-xl border border-gray-200"
      >
        <summary className="px-4 py-2 text-sm font-medium text-gray-700 cursor-pointer">
          商城元素技术规范
        </summary>
        <div className="px-4 pb-4">
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded-lg">
            {SHOP_ELEMENT_SPECS}
          </pre>
        </div>
      </details>
    </div>
  );
}

// ============================================================
// Item Elements Panel (道具元素) — CRUD + Icon files
// ============================================================

function ItemElementsPanel() {
  const utils = trpc.useUtils();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [form, setForm] = useState({
    code: '',
    name: '',
    icon: '',
    species: 'plant' as 'plant' | 'animal' | 'element',
    price: 0,
    effectMinutes: 0,
    description: '',
  });
  const [speciesFilter, setSpeciesFilter] = useState<string>('all');
  const [showTechSpecs, setShowTechSpecs] = useState(false);
  const iconsPath = 'items/icons';

  const { data: items, isLoading } = trpc.sprite.adminListItems.useQuery();
  const { data: iconScan } = trpc.admin.files.scanPngs.useQuery(
    { basePath: iconsPath },
    { refetchOnWindowFocus: false },
  );

  const create = trpc.sprite.adminCreateItem.useMutation({
    onSuccess: () => { utils.sprite.adminListItems.invalidate(); setEditorOpen(false); resetForm(); },
    onError: (e) => alert(e.message),
  });
  const update = trpc.sprite.adminUpdateItem.useMutation({
    onSuccess: () => { utils.sprite.adminListItems.invalidate(); setEditorOpen(false); setEditingItem(null); },
    onError: (e) => alert(e.message),
  });
  const toggle = trpc.sprite.adminToggleItemActive.useMutation({
    onSuccess: () => { utils.sprite.adminListItems.invalidate(); },
    onError: (e) => alert(e.message),
  });
  const deleteItem = trpc.sprite.adminDeleteItem.useMutation({
    onSuccess: () => { utils.sprite.adminListItems.invalidate(); },
    onError: (e) => alert(e.message),
  });

  const resetForm = () => setForm({ code: '', name: '', icon: '', species: 'plant', price: 0, effectMinutes: 0, description: '' });

  const openCreate = () => { setEditingItem(null); resetForm(); setEditorOpen(true); };
  const openEdit = (item: any) => {
    setEditingItem(item);
    setForm({ code: item.code, name: item.name, icon: item.icon || '', species: item.species, price: item.price, effectMinutes: item.effectMinutes, description: item.description || '' });
    setEditorOpen(true);
  };

  const handleSave = () => {
    if (!form.code || !form.name) { alert('代码和名称不能为空'); return; }
    if (editingItem) {
      update.mutate({ code: form.code, name: form.name, icon: form.icon, species: form.species as any, price: form.price, effectMinutes: form.effectMinutes, description: form.description });
    } else {
      create.mutate(form);
    }
  };

  const displayItems = items?.filter(i => speciesFilter === 'all' || i.species === speciesFilter) || [];

  return (
    <div>
      {/* === Upper: Item CRUD === */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">道具管理</h2>
        <button onClick={openCreate}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
          + 新建道具
        </button>
      </div>

      {/* Species filter */}
      <div className="flex gap-2 mb-3">
        {([['all', '全部'], ['plant', '植物系'], ['animal', '动物系'], ['element', '元素系']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setSpeciesFilter(key)}
            className={`px-3 py-1.5 text-sm rounded-full border transition ${
              speciesFilter === key ? 'border-gray-900 bg-gray-900 text-white' : 'hover:border-gray-500'
            }`}>{label}</button>
        ))}
      </div>

      {/* Items table */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400">加载中...</div>
      ) : !displayItems.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">暂无道具</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-3 font-medium text-gray-500">图标</th>
                <th className="text-left px-3 py-3 font-medium text-gray-500">名称</th>
                <th className="text-left px-3 py-3 font-medium text-gray-500">系别</th>
                <th className="text-left px-3 py-3 font-medium text-gray-500">价格（🫘）</th>
                <th className="text-left px-3 py-3 font-medium text-gray-500">状态</th>
                <th className="text-left px-3 py-3 font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayItems.map(item => (
                <tr key={item.code} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-xl">{item.icon}</td>
                  <td className="px-3 py-3 font-medium">{item.name}</td>
                  <td className="px-3 py-3">{SPECIES_LABELS[item.species] || item.species}</td>
                  <td className="px-3 py-3 font-semibold text-amber-600">{item.price}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${item.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {item.isActive ? '上架中' : '已下架'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => toggle.mutate({ code: item.code, isActive: !item.isActive })}
                        className={`text-xs px-2 py-1 rounded transition ${item.isActive ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                        {item.isActive ? '下架' : '上架'}
                      </button>
                      <button onClick={() => openEdit(item)}
                        className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition">
                        编辑
                      </button>
                      <button onClick={() => { if (confirm(`确定删除道具「${item.name}」吗？`)) deleteItem.mutate({ code: item.code }); }}
                        className="text-xs px-2 py-1 text-red-600 border border-red-200 rounded hover:bg-red-50 transition">
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Item editor dialog */}
      {editorOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { setEditorOpen(false); setEditingItem(null); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">{editingItem ? '编辑道具' : '新建道具'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">代码</label>
                <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  disabled={!!editingItem}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                  placeholder="例：sunflower_small" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="例：小型生长剂" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">图标（Emoji）</label>
                <input type="text" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="例：🧪" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">系别</label>
                <select value={form.species} onChange={e => setForm(f => ({ ...f, species: e.target.value as 'plant' | 'animal' | 'element' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  {Object.entries(SPECIES_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">效果说明</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="道具效果描述" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">价格（🫘）</label>
                  <input type="number" min={0} value={form.price} onChange={e => setForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">效果（分钟）</label>
                  <input type="number" min={0} value={form.effectMinutes} onChange={e => setForm(f => ({ ...f, effectMinutes: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => { setEditorOpen(false); setEditingItem(null); }}
                  className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition">取消</button>
                <button onClick={handleSave} disabled={create.isPending || update.isPending}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                  {editingItem ? '保存修改' : '创建道具'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === Lower: Item icon files === */}
      <div className="flex items-center justify-between mb-4 mt-8">
        <h2 className="text-lg font-bold text-gray-900">道具图标文件</h2>
        <div className="text-sm text-gray-500">路径：{iconsPath}</div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 min-h-[200px]">
        {!iconScan?.pngs?.length ? (
          <div className="text-sm text-gray-400 text-center py-12">暂无道具图标文件</div>
        ) : (
          <div className="grid grid-cols-10 gap-3">
            {iconScan.pngs.map(png => (
              <div key={png.filename} className="text-center">
                <div className="w-16 h-16 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden mx-auto">
                  <img
                    src={`/assets/sprites/${iconsPath}/${png.filename}`}
                    alt={png.filename}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="text-[10px] text-gray-400 mt-1 truncate max-w-16" title={png.filename}>
                  {png.filename}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tech specs */}
      <details
        open={showTechSpecs}
        onToggle={e => setShowTechSpecs((e.target as HTMLDetailsElement).open)}
        className="mt-4 bg-white rounded-xl border border-gray-200"
      >
        <summary className="px-4 py-2 text-sm font-medium text-gray-700 cursor-pointer">
          道具元素技术规范
        </summary>
        <div className="px-4 pb-4">
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded-lg">
            {ITEM_ELEMENT_SPECS}
          </pre>
        </div>
      </details>
    </div>
  );
}

// ============================================================
// Sprite Preview Panel — 通过 BroadcastChannel 控制前台精灵组件
// ============================================================

function getPoolKey(level: number): string {
  if (level === 0) return 'L0';
  if (level <= 2) return 'L1-L2';
  if (level <= 5) return 'L3-L5';
  return 'L6-L9';
}

function SpritePreviewPanel() {
  const [selectedPath, setSelectedPath] = useState('');
  const [expandedSpecies, setExpandedSpecies] = useState<string | null>(null);
  const [previewLevel, setPreviewLevel] = useState(9);
  const [selectedAnim, setSelectedAnim] = useState<string | null>(null);

  const parts = selectedPath.split('/');
  const species = parts[0] || '';
  const variant = parts[1] || '';
  const sprites = spriteManifestStatic.sprites as Record<string, Record<string, any>>;
  const variantData = species && variant ? sprites[species]?.[variant] : null;
  const animationPools = variantData?.animation_pools || {};
  const framesData = variantData?.frames || {};
  const poolKey = getPoolKey(previewLevel);
  const availableAnims = animationPools[poolKey] || [];

  const sendCommand = useCallback((type: string, data: Record<string, unknown>) => {
    const channel = new BroadcastChannel('sprite-admin-preview');
    channel.postMessage({ type, ...data });
    channel.close();
  }, []);

  const handleTest = useCallback(() => {
    if (!selectedAnim) { alert('请先选择一个动画'); return; }
    sendCommand('preview-level', { level: previewLevel });
    sendCommand('preview-anim', { animName: selectedAnim });
  }, [selectedAnim, previewLevel, sendCommand]);

  const handleResume = useCallback(() => {
    sendCommand('preview-resume', {});
    setSelectedAnim(null);
  }, [sendCommand]);

  const rootScan = trpc.admin.files.scanDirectory.useQuery({ basePath: '' }, { refetchOnWindowFocus: false });
  const speciesDirs = (rootScan.data?.folders || []).filter(f => !EXCLUDED_FOLDERS.includes(f));

  return (
    <div>
      <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
        <span className="text-amber-500 text-lg">💡</span>
        <div className="text-sm text-amber-800">
          <p className="font-medium">使用说明</p>
          <p className="text-xs text-amber-600 mt-1">
            此面板控制前台实际运行的精灵组件。选择精灵 → 选择等级 → 选择动画 → 点击"测试动画"，前台精灵会切换等级并播放该动画。
            测试后点击"恢复待机"回到自动状态。请确保前台页面已打开并登录。
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Left: Folder tree */}
        <div className="w-64 shrink-0 bg-white rounded-xl border border-gray-200 p-3 max-h-[500px] overflow-y-auto">
          <div className="text-xs font-medium text-gray-500 mb-2">精灵目录</div>
          {speciesDirs.map(s => (
            <div key={s}>
              <button
                onClick={() => setExpandedSpecies(expandedSpecies === s ? null : s)}
                className={`w-full text-left px-2 py-1.5 text-sm font-medium rounded transition ${expandedSpecies === s ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
              >
                {SPECIES_LABELS[s] || s}
              </button>
              {expandedSpecies === s && (
                <PreviewVariantTree species={s} selectedPath={selectedPath} onSelect={setSelectedPath} />
              )}
            </div>
          ))}
        </div>

        {/* Right: Control panel */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6">
          {!selectedPath ? (
            <div className="text-sm text-gray-400 text-center py-12">请在左侧选择一个精灵种类</div>
          ) : variantData ? (
            <>
              <div className="text-sm font-medium text-gray-700 mb-4">
                {species} / {variant} — 预览控制
              </div>

              {/* Step 1: Level selector */}
              <div className="mb-6">
                <label className="block text-xs font-medium text-gray-500 mb-2">
                  1. 选择精灵等级
                </label>
                <div className="grid grid-cols-10 gap-1">
                  {Array.from({ length: 10 }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setPreviewLevel(i)}
                      className={`py-2 text-sm rounded transition ${previewLevel === i ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      L{i}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  动画池: {poolKey} — 可用: {availableAnims.length > 0 ? availableAnims.join(', ') : '无（回退 CSS 动画）'}
                </div>
              </div>

              {/* Step 2: Animation selector */}
              {availableAnims.length > 0 && (
                <div className="mb-6">
                  <label className="block text-xs font-medium text-gray-500 mb-2">
                    2. 选择要播放的动画
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(availableAnims as string[]).map(anim => {
                      const frameCount = framesData[anim]?.frames?.length || 0;
                      const fps = framesData[anim]?.fps || 6;
                      const duration = frameCount > 0 ? (frameCount / fps).toFixed(1) : '?';
                      return (
                        <button
                          key={anim}
                          onClick={() => setSelectedAnim(anim)}
                          className={`text-left px-3 py-2 rounded-lg transition border ${selectedAnim === anim ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-600 border-transparent hover:bg-gray-100'}`}
                        >
                          <div className="text-sm font-medium">{anim}</div>
                          <div className="text-[10px] text-gray-400">{frameCount} 帧 · {duration} 秒</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 3: Action buttons */}
              <div className="flex gap-3 mb-6">
                <button
                  onClick={handleTest}
                  disabled={!selectedAnim}
                  className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  ▶ 测试动画
                </button>
                <button
                  onClick={handleResume}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
                >
                  ↺ 恢复待机
                </button>
              </div>

              {/* Level images */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">全部等级</label>
                <div className="grid grid-cols-10 gap-1">
                  {Array.from({ length: 10 }, (_, i) => {
                    const img = variantData.images?.[`L${i}`];
                    return (
                      <button
                        key={i}
                        onClick={() => setPreviewLevel(i)}
                        className={`w-full aspect-square bg-gray-50 rounded border-2 flex items-center justify-center overflow-hidden transition ${previewLevel === i ? 'border-gray-900' : 'border-gray-100 hover:border-gray-300'}`}
                        title={`L${i}${img ? '' : ' (不存在)'}`}
                      >
                        {img ? (
                          <img src={img} alt={`L${i}`} className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-[8px] text-gray-300">L{i}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-amber-500 text-center py-12">
              该精灵未在清单中注册<br />
              <span className="text-xs">请点击"重新生成清单"</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewVariantTree({ species, selectedPath, onSelect }: {
  species: string;
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const { data: speciesScan } = trpc.admin.files.scanDirectory.useQuery(
    { basePath: species },
    { refetchOnWindowFocus: false },
  );
  const variantDirs = speciesScan?.folders || [];
  return (
    <div>
      {variantDirs.map(v => (
        <button
          key={v}
          onClick={() => onSelect(`${species}/${v}`)}
          className={`w-full text-left px-2 py-1 text-sm rounded transition truncate ${
            selectedPath === `${species}/${v}`
              ? 'bg-gray-900 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================

type MainTab = 'sprite' | 'shop' | 'sprite-text';
type SpriteSubTab = 'images' | 'animations' | 'preview';
type ShopSubTab = 'shopElements' | 'itemElements';

export default function AdminArtAssetsPage() {
  const [mainTab, setMainTab] = useState<MainTab>('sprite');
  const [spriteSubTab, setSpriteSubTab] = useState<SpriteSubTab>('images');
  const [shopSubTab, setShopSubTab] = useState<ShopSubTab>('shopElements');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">美术资产管理</h1>
        <p className="text-sm text-gray-500 mt-1">管理本地文件系统的美术资产（精灵形象、动画、商城道具）</p>
      </div>

      {/* Level 1 Tabs: 精灵 / 商城 */}
      <div className="flex gap-0 border-b border-gray-200 mb-4">
        {([
          ['sprite', '精灵'],
          ['shop', '商城'],
          ['sprite-text', '精灵文本'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMainTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
              mainTab === key
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Level 2 Tabs: Sub-pages */}
      {mainTab === 'sprite' && (
        <div className="flex gap-0 border-b border-gray-100 mb-4">
          {([
            ['images', '精灵形象'],
            ['animations', '精灵动画'],
            ['preview', '精灵预览'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSpriteSubTab(key)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 transition -mb-px ${
                spriteSubTab === key
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {mainTab === 'shop' && (
        <div className="flex gap-0 border-b border-gray-100 mb-4">
          {([
            ['shopElements', '商城元素'],
            ['itemElements', '道具元素'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setShopSubTab(key)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 transition -mb-px ${
                shopSubTab === key
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Sub-page content */}
      {mainTab === 'sprite' && spriteSubTab === 'images' && <SpriteImagesPanel />}
      {mainTab === 'sprite' && spriteSubTab === 'animations' && <SpriteAnimationsPanel />}
      {mainTab === 'sprite' && spriteSubTab === 'preview' && <SpritePreviewPanel />}
      {mainTab === 'shop' && shopSubTab === 'shopElements' && <ShopElementsPanel />}
      {mainTab === 'shop' && shopSubTab === 'itemElements' && <ItemElementsPanel />}
      {mainTab === 'sprite-text' && <SpriteTextPanel />}
    </div>
  );
}
