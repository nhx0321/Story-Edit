# 精灵动画复用方案

## 一、形象图层叠加系统（减少AI生图成本）

### 核心思路：每个等级 = 前一级所有图层 + 1个新增图层

```
Lv.1  [底层] 基础身体
Lv.2  Lv.1 + 小配件（花瓣/耳尖/光晕）
Lv.3  Lv.2 + 特征强化（更多花瓣/尾巴变大/气流增多）
Lv.4  Lv.3 + 表情强化
Lv.5  Lv.4 + 发光层
Lv.6  Lv.5 + 粒子层
Lv.7  Lv.6 + 宝石/标记层
Lv.8  Lv.7 + 翅膀/皇冠层
Lv.9  Lv.8 + 光环层
```

### 实际需要AI生成的图片数量

| 系别 | 底层(1级) | 叠加层(2-9级) | 小计 |
|------|-----------|---------------|------|
| 植物系 | 1张（身体） | 8张（花瓣→发光→粒子→宝石→翅膀→光环） | 9张 |
| 动物系 | 1张（身体） | 8张（尾巴→发光→粒子→宝石→翅膀→光环） | 9张 |
| 元素系 | 1张（身体） | 8张（气流→发光→粒子→宝石→翅膀→光环） | 9张 |
| **合计** | **3张** | **24张叠加层** | **27张** |

> 对比：如果每级单独生成 = 30张。叠加方案 = 27张 + 可以复用相同叠加层（如发光/粒子/翅膀/光环层在3系之间只需调色），实际只需 **3张底层 + 12张通用叠加层 × 3色调 = 39张**，但通用叠加层可以AI批量生成同一组换色。

### 前端图层合成方案

```css
/* 精灵容器 — 多层叠加 */
.sprite-container {
  position: relative;
  width: 72px;
  height: 72px;
}

.sprite-base {
  position: absolute;
  inset: 0;
  /* Lv.1 基础图片 */
}

.sprite-overlay-1 {
  position: absolute;
  inset: 0;
  /* Lv.2 新增图层，透明度50% */
}

.sprite-glow {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,215,0,0.3) 0%, transparent 70%);
  /* Lv.5 发光层，通用，只需调颜色 */
  animation: pulse-glow 2s ease-in-out infinite;
}

.sprite-particles {
  position: absolute;
  inset: -4px;
  /* Lv.6 粒子层，纯CSS实现 */
}

.sprite-wings {
  position: absolute;
  inset: 0;
  /* Lv.8 翅膀层，通用形状，调色适配 */
  animation: wing-flap 1.5s ease-in-out infinite;
}

.sprite-halo {
  position: absolute;
  inset: -12px;
  border: 2px solid rgba(255,215,0,0.4);
  border-radius: 50%;
  /* Lv.9 光环层，通用 */
  animation: halo-rotate 4s linear infinite;
}
```

### 通用叠加层（3系通用，只调颜色）

| 叠加层 | 触发等级 | 效果 | 通用性 |
|--------|---------|------|--------|
| 发光层 | Lv.5+ | 径向渐变呼吸动画 | 完全通用，3色调 |
| 粒子层 | Lv.6+ | CSS小圆点环绕 | 完全通用 |
| 宝石层 | Lv.7+ | 额头小菱形标记 | 形状通用，颜色不同 |
| 翅膀层 | Lv.8+ | 两侧CSS翅膀扇动 | 形状通用，颜色不同 |
| 光环层 | Lv.9 | 外圈旋转光环 | 完全通用 |

**实际需要AI生成的独特素材：3张底层 + 3系 × 3独特层(2-4级) = 12张**
其余5层全部通用CSS实现。

---

## 二、升级动画逐级递增方案

### 核心思路：每级动画 = 前一级动画 + 1个新特效

```
Lv.0→1  [孵化] 蛋裂开 → 光射出 → 新精灵出现
Lv.1→2  闪光一下 + 体型微膨胀
Lv.2→3  Lv.1→2 + 小星星出现
Lv.3→4  Lv.2→3 + 旋转一圈 + pose
Lv.4→5  Lv.3→4 + 光晕扩散 + 彩带
Lv.5→6  Lv.4→5 + 飞向空中 + 冲击波
Lv.6→7  Lv.5→6 + 粒子风暴 + 超级英雄落地
Lv.7→8  Lv.6→7 + 光柱 + 翅膀展开
Lv.8→9  Lv.7→8 + 天空裂痕 + 全屏金色光芒
```

### 前端实现：CSS动画组件组合

```tsx
// 升级动画组件 — 根据等级组合特效
function UpgradeAnimation({ fromLevel, toLevel, oldImage, newImage, species }) {
  // 基础动画（所有等级都有）
  const effects = [
    { name: 'flash', always: true },           // 闪光
    { name: 'scale', from: 2 },                // 膨胀 Lv.2+
    { name: 'stars', from: 3 },                // 星星 Lv.3+
    { name: 'spin', from: 4 },                 // 旋转 Lv.4+
    { name: 'confetti', from: 5 },             // 彩带 Lv.5+
    { name: 'shockwave', from: 6 },            // 冲击波 Lv.6+
    { name: 'particle-storm', from: 7 },       // 粒子风暴 Lv.7+
    { name: 'light-pillar', from: 8 },         // 光柱 Lv.8+
    { name: 'sky-crack', from: 9 },            // 天空裂痕 Lv.9
  ];

  return (
    <div className="upgrade-container">
      {effects.map(e => {
        if (e.from && toLevel < e.from) return null;
        return <Effect key={e.name} name={e.name} species={species} />;
      })}
      <ImageTransition from={oldImage} to={newImage} />
    </div>
  );
}
```

### CSS特效实现（全部纯CSS，无需额外图片）

```css
/* 1. 闪光 — 通用 */
@keyframes flash {
  0% { opacity: 0; }
  20% { opacity: 1; background: white; }
  100% { opacity: 0; }
}

/* 2. 膨胀 — 通用 */
@keyframes scale-up {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); }
  100% { transform: scale(1); }
}

/* 3. 星星 — 通用，颜色按系别 */
@keyframes star-appear {
  0% { opacity: 0; transform: scale(0) rotate(0deg); }
  50% { opacity: 1; transform: scale(1.2) rotate(180deg); }
  100% { opacity: 0; transform: scale(0.8) rotate(360deg); }
}

/* 4. 旋转 — 通用 */
@keyframes spin-around {
  0% { transform: rotate(0deg) scale(1); }
  50% { transform: rotate(180deg) scale(1.1); }
  100% { transform: rotate(360deg) scale(1); }
}

/* 5. 彩带 — CSS小条 */
@keyframes confetti-fall {
  0% { transform: translateY(-100px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100px) rotate(720deg); opacity: 0; }
}

/* 6. 冲击波 — 通用 */
@keyframes shockwave {
  0% { transform: scale(0); opacity: 0.8; border-width: 4px; }
  100% { transform: scale(3); opacity: 0; border-width: 1px; }
}

/* 7. 粒子风暴 — 通用，颜色按系别 */
@keyframes particle-spin {
  0% { transform: rotate(0deg) translateX(30px); }
  100% { transform: rotate(360deg) translateX(30px); }
}

/* 8. 光柱 — 通用 */
@keyframes light-pillar {
  0% { height: 0; opacity: 1; }
  50% { height: 300px; opacity: 0.8; }
  100% { height: 300px; opacity: 0; }
}

/* 9. 天空裂痕 — 通用 */
@keyframes sky-crack {
  0% { clip-path: polygon(50% 0%, 50% 0%); opacity: 1; }
  50% { clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%); }
  100% { clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%); opacity: 0; }
}
```

---

## 三、日常动作逐级递增方案

### 核心思路：同一动作模板 + 等级特效递增

```
动作：弹跳(bounce)
  Lv.1:  简单弹跳
  Lv.2:  弹跳 + 尾巴摇（动物）/ 花瓣抖（植物）/ 气流转（元素）
  Lv.3:  Lv.2 + 落地小震动
  Lv.4:  Lv.3 + 表情变化
  Lv.5:  Lv.4 + 微光闪烁
  Lv.6:  Lv.5 + 粒子拖尾
  Lv.7:  Lv.6 + 宝石闪光
  Lv.8:  Lv.7 + 翅膀扇动
  Lv.9:  Lv.8 + 光环旋转
```

### 9个等级 × 3个系别的动作复用表

| 动作编号 | 动作名 | 触发条件 | 复用策略 |
|---------|--------|---------|---------|
| A1 | 弹跳 | 默认 | 3系共用动画框架，系别特效不同 |
| A2 | 张望 | 每15秒 | 3系共用动画框架，系别特效不同 |
| A3 | 打盹 | 无操作30秒 | 3系共用CSS缩放+透明度 |
| A4 | 伸懒腰 | 页面停留1分钟 | 3系共用动画框架 |
| A5 | 玩耍 | 双击 | 系别完全独立（核心差异化） |
| A6 | 跑步 | 拖拽中 | 3系共用位移动画，脚步不同 |
| A7 | 庆祝 | 签到完成 | 3系共用粒子/花瓣模板，颜色不同 |
| A8 | 思考 | AI反馈时 | 3系共用歪头CSS动画 |
| A9 | 睡觉 | 疲劳满 | 3系共用缩放+透明度 |

**实际需要制作的动画：5个通用CSS + 3系 × 5个特色动作 = 20个**
- 通用CSS动画（A1-A4, A6-A9的基础部分）：约50行CSS
- 系别特色动作（A5全独立 + A1-A4/A7的系别特效层）：约15个

### 层级结构示例

```
精灵组件
├── 基础层（Base Layer）
│   └── 精灵图片（随等级变化，图层叠加）
├── 日常动作层（Action Layer）
│   ├── 弹跳动画（通用CSS）
│   ├── 系别特效（Lv.2+，3系不同）
│   ├── 光晕层（Lv.5+，通用调色）
│   ├── 粒子层（Lv.6+，通用调色）
│   └── 翅膀层（Lv.8+，通用调色）
├── 交互层（Interaction Layer）
│   ├── 点击反馈（通用CSS）
│   ├── 拖拽反馈（通用CSS）
│   └── 疲劳层（通用CSS）
└── 升级动画层（Upgrade Layer）
    ├── 闪光（通用）
    ├── 膨胀（Lv.2+）
    ├── 星星（Lv.3+）
    ├── 旋转（Lv.4+）
    ├── 彩带（Lv.5+）
    ├── 冲击波（Lv.6+）
    ├── 粒子风暴（Lv.7+）
    ├── 光柱（Lv.8+）
    └── 天空裂痕（Lv.9）
```

### 成本总结

| 项目 | 原方案 | 优化方案 | 节省 |
|------|--------|---------|------|
| AI生图 | 30张（3系×10级） | 12张底层 + 5通用层×3色 = 27张 | ~10% |
| 独特图片 | 30张 | **12张独特** + 15张调色复用 | **60%** |
| 升级动画 | 9个独立 | 1个模板 + 9级递增组合 | **89%** |
| 日常动作 | 9级×3系×9动作 = 243个 | **5通用 + 15特色 = 20个** | **92%** |

**核心原则：动画是逻辑，图片是皮肤。逻辑复用，皮肤叠加。**
