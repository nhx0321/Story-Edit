# 2026-05-05 版本统一收口执行台账

> 用途：作为本轮“版本统一 / 基线固定 / 回归对照 / 回滚判断”的项目侧证据仓库。
>
> 规则：
> 1. 跨会话总状态、阶段判断、优先级变更仍只写 `工具开发/软件工具开发-skill/版本统一与线上恢复持续追踪.md`
> 2. 本文档只记录本轮实际收口动作、纳入范围、验证结果、改前改后对照、是否回退
> 3. 每次新增代码改动、验证、部署动作后，都要在本文档追加，不把关键证据只留在聊天窗口

---

## 1. 本轮冻结边界

### A. 纳入本轮版本统一的真实修复

#### A1. 模型链路修复
- `apps/server/src/routes/ai-stream-platform.ts`
- `apps/server/src/routes/api-v1.ts`
- `apps/web/components/chat/chat-panel.tsx`
- `apps/web/lib/ai-stream.ts`
- `apps/web/next.config.js`
- `packages/ai-adapters/src/adapters/openai-compat.ts`

收口目标：
- 统一 `provider/modelId` 与纯 `modelId` 的传递口径
- 保住 qwen / deepseek / longcat 新对话可发送
- 保住“新对话绑定当前首选模型、旧对话保持锁定模型”的行为
- 保住前端流式请求在浏览器与 SSR 环境下的正确路由

#### A2. 管理员权限链修复
- `apps/server/src/services/token-relay/router.ts`
- `apps/server/src/services/token-relay/token-billing.ts`
- `apps/web/app/admin/layout.tsx`
- `apps/web/app/settings/profile/page.tsx`

收口目标：
- 保住管理员账号进入 `/admin` 后能刷新到最新 `auth.me` 权限状态
- 保住 `isAdmin / adminLevel / displayId` 不会在资料更新后被前端缓存写丢
- 保住总管理员看到完整后台菜单，并且后台接口不因账户状态缺失而误报 403 / 500
- 补齐 `ensureAccount()` 的幂等性，避免因账户缺失拖垮后台或模型链路

#### A3. 运行稳定性修复
- `apps/server/src/services/ai-gateway/crypto.ts`

收口目标：
- 去掉运行时 `require('crypto')` 取 hash 的不一致写法，统一为静态导入

#### A4. 本轮收口文档与基线资产
- `工具开发/软件工具开发-skill/版本统一与线上恢复持续追踪.md`
- `docs/release-self-check/2026-05-05-version-unification-worklog.md`
- `docs/release-self-check/baseline/2026-05-05-*`

### B. 明确不纳入本轮版本统一
- `apps/web/next-env.d.ts`
- `baseline-bundle.tgz`
- `apps/web/public/backgrounds/` 内的大文件背景资源
- 压缩包、数据库导出、临时备份、一次性截图/控制台复制物
- `docs/database-backup/` 下的备份产物

处理规则：
- 不进入本轮代码提交
- 只作为证据或服务器侧静态资源保留
- 背景资源继续遵守“代码走 GitHub、资源走 scp 直传”的双轨规则

### C. 暂缓，不混入本轮收口
来源：`工具开发/软件工具开发-skill/开发需求.md`

暂缓项：
1. longcat 渠道补充 API 的业务配置事项
2. 已删除用户从管理员列表删除并清空后台占用
3. Token 余额文案调整为“今日免费 token 用量”
4. 充值购买 / Token 页面余额卡片文案同步调整
5. 免费模型日限额统计未正确覆盖 longcat 消耗
6. 站内用量统计柱状图展示优化
7. 模板广场角色分类归类问题

执行规则：
- 本轮只记录为 backlog，不在“版本统一”提交里实现
- 后续另开业务任务，不与基线收口混提

---

## 2. 基线快照索引

本轮新增基线文件：
- `docs/release-self-check/baseline/2026-05-05-baseline-index.md`
- `docs/release-self-check/baseline/2026-05-05-local-working-tree.txt`
- `docs/release-self-check/baseline/2026-05-05-github-baseline.txt`
- `docs/release-self-check/baseline/2026-05-05-server-runtime-summary.txt`
- `docs/release-self-check/baseline/2026-05-05-admin-regression-baseline.md`
- `docs/release-self-check/baseline/2026-05-05-db-permission-baseline.txt`

已存在、继续保留的旧基线：
- `baseline/git-status-before.txt`
- `baseline/git-diff-stat-before.txt`
- `baseline/git-diff-before.patch`
- `baseline/admin-pages-before.txt`
- `baseline/ai-config-pages-before.txt`
- `baseline/settings-pages-before.txt`
- `baseline/migrations-dir-before.txt`
- `baseline/migrations-meta-before.txt`
- `baseline/sprites-assets-before.txt`

使用规则：
- 旧基线保留“此前一次发布修复前”的材料
- 本轮新增基线保留“版本统一收口启动时”的材料
- 后续每轮回归只增量追加，不覆盖旧证据

---

## 3. 当前版本与部署基线结论

### 3.1 本地 / GitHub
- 本地仓库分支：`main`
- 本地 HEAD：`147be667ddca59d9a96e0962722541c7af48db7a`
- GitHub `origin/main`：`147be667ddca59d9a96e0962722541c7af48db7a`
- 结论：当前本地已提交版本与 GitHub 已统一到同一 commit，未出现分叉；但本地工作树仍保留未提交代码改动与 2 个未跟踪归档文件，属于后续开发态，不影响当前线上运行版本。

### 3.2 阿里云服务器
- 线上真实运行仓库：`/root/story-edit-gitified`
- 当前分支：`main`
- 服务器 HEAD：`147be667ddca59d9a96e0962722541c7af48db7a`
- 服务器跟踪分支：`origin/main`
- 结论：服务器 git 工作副本已与 GitHub 对齐，未出现分叉。
- PM2 在线：`story-edit-server`、`story-edit-web`
- PM2 cwd：
  - `story-edit-server` -> `/root/story-edit-gitified/apps/server`
  - `story-edit-web` -> `/root/story-edit-gitified/apps/web`
- 健康检查通过：
  - `curl http://127.0.0.1:3001/health` → 200
  - `curl http://127.0.0.1:3000` → 200
  - `template.list` tRPC → 200
- 服务器 `git status` 当前仅剩 `apps/web/public/backgrounds/` 未跟踪，这属于背景资源走 scp 直传的双轨规则，不构成代码版本分叉。

### 3.3 数据库 / 权限链
- 管理员基线账号：`阿木 / nhx0321@163.com / UID100000`
- 数据库中该账号状态：`is_admin = true`、`admin_level = 0`
- `is_admin = true AND admin_level IS NULL` 当前计数：`0`
- `user_token_accounts`、`api_channels` 关键列均存在，未见本轮 P0 缺列现象

---

## 4. 管理员能力回归基线

### 4.1 账号基线
- 账号昵称：`阿木`
- 邮箱：`nhx0321@163.com`
- 显示 ID：`UID100000`
- 预期等级：总管理员（`admin_level = 0`）

### 4.2 四层回归清单

| 层级 | 基线预期 | 当前证据入口 |
| --- | --- | --- |
| 入口显示 | Navbar 出现“管理后台”入口 | `apps/web/components/layout/navbar.tsx` |
| 菜单显示 | `/admin` 左侧显示完整菜单 | `apps/web/app/admin/layout.tsx` |
| 页面进入 | `权限管理 / 营收仪表盘 / 模型定价 / 渠道管理 / 历史迁移` 可进入 | `apps/web/app/admin/*` |
| 接口可用 | `auth.me`、`adminProcedureLevel(0)` 相关接口不 403 / 不 500 | `apps/server/src/services/auth/router.ts`、`apps/server/src/trpc.ts` |

### 4.3 本轮重点保护点
- `auth.me` 必须返回：`isAdmin`、`adminLevel`、`displayId`
- `admin/layout.tsx` 必须以服务器返回值刷新前端权限缓存
- `profile/page.tsx` 更新昵称/资料时，不能把管理员字段写丢
- `adminProcedureLevel(0)` 对 `admin_level = null` 仍会拒绝，因此不能只修前端菜单，不修数据库或 `auth.me`

---

## 5. 数据库与部署对齐判断

### 5.1 已确认对齐项
- `users.is_admin` 存在
- `users.admin_level` 存在
- `user_token_accounts.preferred_model` 存在
- `api_channels` 包含 `priority / weight / user_tier / daily_limit / daily_used / last_error_at / last_error_message`

### 5.2 当前未闭合项
- 线上目录还未 git 化，无法在服务器直接完成“GitHub 拉取 → 对比 → 回滚”闭环
- 本轮尚未完成管理员页面级冒烟，当前只完成了数据库与代码链路基线固定
- 本轮尚未执行本地 `pnpm build / typecheck / test` 新一轮收口自检

### 5.3 当前回退手段
- 线上仍保留 archive/scp 覆盖式发布经验
- `standard-deploy.md` 已明确背景资源双轨规则，可避免误把大文件纳入 GitHub
- 后续服务器 git 化前，应继续把 archive/scp 流程保留为应急回退方案

---

## 6. 本轮执行记录

## [2026-05-05 / 收口启动与基线固定]

### 本轮目标
- 固定主追踪文档与项目侧台账
- 补齐本轮 baseline 索引和证据文件
- 锁定“纳入 / 不纳入 / 暂缓”边界
- 把管理员权限链、线上部署状态、数据库关键字段先做成基线

### 已执行
- 读取并复核：
  - 主追踪文档
  - 2026-05-04 部署修复清单
  - `standard-deploy.md`
  - 数据库验证 / 取证 / 差异清单
  - `开发需求.md`
- 核对本地仓库：当前分支、HEAD、origin HEAD、本地未提交文件
- 核对线上环境：
  - `/root/Story-Edit` 是否 git 仓库
  - PM2 进程状态
  - `3001/health`、`3000`、`template.list`
  - 背景资源目录是否在位
- 核对线上数据库：
  - 管理员账号 `is_admin / admin_level`
  - `is_admin=true and admin_level is null` 数量
  - `user_token_accounts` 结构
  - `api_channels` 结构
- 建立本轮新增 baseline 文件组

### 结果
- 已把“持续追踪入口”与“项目侧执行台账”分离固定
- 已确认当前本地 / GitHub 已提交基线一致，但线上目录仍非 git 仓库
- 已确认线上服务当前可运行，但发布主链仍未恢复到 git pull 模式
- 已确认线上 AI 功能当前可用，并作为本轮及后续各轮任务的核心保护对象
- 已确认管理员数据库基线正常，当前最需要保护的是前端缓存刷新与接口权限一致性
- 已明确本轮只收口已有修复，不混入 `开发需求.md` 的业务 backlog

### 新发现
- 服务器当前没有直接可用的 `psql` 命令，改用项目目录下 `node + pg` 查询数据库更稳
- baseline 目录已存在上一轮 `before` 证据，本轮应继续采用“新增，不覆盖”策略
- 当前未提交范围只有 11 个应纳入代码文件 + `next-env.d.ts` + `baseline-bundle.tgz`，比历史大 diff 已明显收敛

### 下一步
1. 按本台账冻结暂存范围，排除 `next-env.d.ts` 与 `baseline-bundle.tgz`
2. 每轮任务先做本地收口自检：TypeScript / build / 必要测试
3. 自检通过后，再继续管理员回归与模型主链回归
4. 任何需要用户手动执行的操作，先写入引导文档顶端滚动区，再在对话中提示用户执行
5. 全部回归通过后，再处理 git 提交 / GitHub 推送 / 服务器 git 化方案

### 涉及文件
- `工具开发/软件工具开发-skill/版本统一与线上恢复持续追踪.md`
- `docs/release-self-check/2026-05-05-version-unification-worklog.md`
- `docs/release-self-check/baseline/2026-05-05-*`

## [2026-05-05 / 本地收口自检]

### 本轮目标
- 在继续回归与收口前，先确认当前本地改动没有破坏已可用主链
- 尤其先保护线上当前已可用的 AI 核心能力，不带着明显构建/类型错误进入下一轮

### 已执行
- 执行 `pnpm --filter @story-edit/server lint`
- 执行 `pnpm build`
- 执行 `pnpm --filter @story-edit/web test`

### 结果
- server TypeScript 检查通过
- monorepo build 通过
- web 测试通过：`1 passed / 11 passed`
- 当前收口文件在本地类型、构建、既有前端测试层面未见回退

### 新发现
- Next 16 仍提示 `middleware` 未来迁移到 `proxy`，但当前不阻塞构建，也不属于本轮收口问题
- 本地自检已通过，下一步可以继续进入管理员权限与模型主链回归验证

### 下一步
1. 继续做管理员权限链与模型主链的代码级/页面级回归核对
2. 保持“每轮先自检，再继续任务”的固定节奏
3. 需要用户手动执行的线上回归，已写入引导文档顶端，等待结果反馈

### 涉及文件
- `package.json`
- `apps/server/package.json`
- `apps/web/package.json`

## [2026-05-05 / 管理员权限链与模型主链代码回归核对]

### 本轮目标
- 在不动线上环境的前提下，先用代码与现有运行证据核对两条最关键主链：
  1. 线上 AI 模型主链
  2. 总管理员权限链
- 在要求用户做手动线上验证前，先确认本地改动在逻辑上没有明显破坏点

### 已执行
- 复核模型主链相关文件：
  - `apps/web/components/chat/chat-panel.tsx`
  - `apps/web/lib/use-chat.ts`
  - `apps/web/lib/ai-stream.ts`
  - `apps/server/src/routes/ai-stream-platform.ts`
  - `apps/server/src/routes/api-v1.ts`
  - `packages/ai-adapters/src/adapters/openai-compat.ts`
  - `apps/server/src/services/conversation/router.ts`
- 复核管理员权限链相关文件：
  - `apps/web/lib/auth-store.ts`
  - `apps/web/app/admin/layout.tsx`
  - `apps/web/app/settings/profile/page.tsx`
  - `apps/server/src/services/auth/router.ts`
  - `apps/server/src/services/token-relay/router.ts`
  - `apps/server/src/services/token-relay/token-billing.ts`
  - `apps/web/app/admin/channels/page.tsx`
- 结合已拿到的线上数据库与健康检查基线，整理回归判断
- 将需要用户执行的线上手动回归写入：
  - `工具开发/软件工具开发-skill/云服务器部署与线上验证-2026-05-04.md` 顶端引导区

### 结果
- 模型主链代码结论：
  - 新对话创建时会把 `preferredModelId` 写入 conversation 的 `modelId`
  - 发送消息时优先使用 `convData.modelId`，因此旧对话会保持原锁定模型
  - 前端流式请求已直连后端，绕过 Next 代理 30s 限制
  - 服务端在 `ai-stream-platform.ts` 与 `api-v1.ts` 中都会把 `provider/modelId` 解析为纯 `modelId` 再发给上游适配器
  - `openai-compat.ts` 现已统一使用纯模型名调用上游 `/chat/completions`
- 管理员权限链代码结论：
  - `auth.me` 返回 `isAdmin / adminLevel / displayId`
  - `admin/layout.tsx` 进入后台后会用 `auth.me` 刷新本地 auth store
  - 对旧缓存 `isAdmin=true + adminLevel=null` 做了兼容，菜单层会临时按总管理员处理
  - `profile/page.tsx` 在更新资料成功后会保留 `isAdmin / displayId / adminLevel`，不会把管理员字段从前端缓存写丢
  - `token-relay` 后台核心接口仍由 `adminProcedureLevel(0)` 保护，和当前数据库基线 `admin_level = 0` 一致
- 当前判断：
  - 代码层面未看到会直接打断线上 AI 主链或总管理员权限链的明显新破坏点
  - 但页面级最终结论仍必须依赖一次真实线上手动回归

### 新发现
- `auth-store.test.ts` 已覆盖 `isAdmin` 与 `adminLevel=0` 的基础行为，这一层已有自动化保障
- `AdminChannelsPage` 直接依赖 `trpc.token.listChannels.useQuery()`，因此 `/admin/channels` 是否正常，是校验总管理员权限链是否闭合的高价值页面
- 当前最关键未闭合项已经不是类型/构建问题，而是“真实登录态下的线上交互回归”

### 下一步
1. 按冻结边界准备最终收口：纳入 11 个代码文件 + 7 个本轮基线/台账文件
2. 继续排除 `apps/web/next-env.d.ts` 与 `baseline-bundle.tgz`
3. 在创建 GitHub 新基线前，再执行一轮最终自检
4. 自检通过后，再进行提交范围确认与 GitHub 收口

### 涉及文件
- `apps/web/app/settings/profile/page.tsx`
- `deploy.sh`

## [2026-05-05 / 收口范围复核完成]

### 本轮目标
- 在进入 GitHub 基线收口前，再次确认本地工作树里哪些内容应纳入、哪些必须排除
- 避免把生成物、压缩包或临时噪声混进最终统一版本

### 已执行
- 复核 `git status --short --branch`
- 复核 `git diff --stat`
- 复核 11 个应纳入代码文件的 diff 与增减行数
- 复核本轮新增 worklog 与 baseline 文件集合
- 单独核对 `apps/web/next-env.d.ts` 差异内容
- 单独列出当前所有未跟踪文件

### 结果
- 当前跟踪内改动共 12 个文件，其中：
  - 11 个属于本轮应纳入代码修复
  - 1 个属于明确排除项：`apps/web/next-env.d.ts`
- 当前未跟踪文件共 8 个，其中：
  - 7 个属于本轮应纳入文档/基线资产
  - 1 个属于明确排除项：`baseline-bundle.tgz`
- `apps/web/next-env.d.ts` 变化仅为 Next 自动生成的 routes 类型引用路径切换：
  - `./.next/dev/types/routes.d.ts` → `./.next/types/routes.d.ts`
  - 属于生成物，不应纳入统一版本提交
- 因此，本轮建议收口范围已经明确为：
  - **代码修复 11 个文件**
  - **文档/基线 7 个文件**
  - **明确排除 2 个噪声项**

### 新发现
- 当前代码改动规模已收敛到 11 个真实修复文件，未再出现新的业务文件混入
- `baseline-bundle.tgz` 仍是唯一未跟踪的二进制噪声项，后续提交前只需继续保持不纳入
- 当前尚未进入 git 提交阶段，因此工作树仍处于“可继续核查、可继续追加说明”的安全状态

### 下一步
1. 按当前冻结边界执行一轮最终自检
2. 自检通过后，准备提交范围清单
3. 然后再进入 GitHub 新统一基线创建步骤

### 涉及文件
- `docs/release-self-check/2026-05-05-version-unification-worklog.md`
- `docs/release-self-check/baseline/2026-05-05-*`
- `apps/web/next-env.d.ts`
- `baseline-bundle.tgz`

## [2026-05-05 / 最终自检通过，收口边界稳定]

### 本轮目标
- 在创建 GitHub 新统一基线前，做最后一轮本地自检
- 确认 build / test 不会引入新的生成物或额外噪声

### 已执行
- 执行 `pnpm --filter @story-edit/server lint`
- 执行 `pnpm --dir "E:/Story Edit/工具开发/项目/story-edit" build`
- 执行 `pnpm --filter @story-edit/web test`
- 再次复核：
  - `git status --short --branch`
  - `git diff --name-only`
  - `git ls-files --others --exclude-standard`

### 结果
- 最终自检全部通过：
  - server TypeScript 检查通过
  - monorepo build 通过
  - web 测试通过（`1 passed / 11 passed`）
- build 与 test 后，工作树未出现新的未跟踪生成物或额外改动
- 当前收口边界保持稳定：
  - **11 个代码修复文件**
  - **7 个文档/基线文件**
  - **2 个明确排除项：`apps/web/next-env.d.ts`、`baseline-bundle.tgz`**
- 说明本轮版本统一已具备进入 GitHub 新基线提交阶段的条件

### 新发现
- `pnpm build` 必须显式在项目根目录执行；若在工作区外直接运行，会报 `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND`
- 这属于执行路径问题，不影响当前代码收口质量

### 下一步
1. 按既定冻结边界准备最终提交范围
2. 在收到提交动作要求后创建 GitHub 新统一基线提交
3. 提交完成后，再单独推进服务器 git 化与规范部署主链恢复

### 涉及文件
- `docs/release-self-check/2026-05-05-version-unification-worklog.md`
- `docs/release-self-check/baseline/2026-05-05-*`
- `apps/web/next-env.d.ts`
- `baseline-bundle.tgz`

---

## 7. 变更 / 验证 / 回退对照表

| 轮次 | 改动范围 | 验证结果 | 改前状态 | 改后状态 | 是否回退 |
| --- | --- | --- | --- | --- | --- |
| 2026-05-05-01 | 新增主台账、baseline 索引与基线证据文件；更新主追踪文档 | 已完成 | 关键结论散落在多份旧文档与聊天上下文 | 本轮已形成“主追踪 + 项目 worklog + baseline 证据组”三层结构 | 否 |
| 2026-05-05-02 | 本地收口自检：server TypeScript、monorepo build、web test | 已完成 | 尚未确认当前 11 个收口文件是否破坏现有主链，尤其线上已可用 AI 能力 | 本地自检全部通过，当前改动至少在构建、类型、现有前端测试层面未破坏主链 | 否 |
| 2026-05-05-03 | 线上 AI 主链手动回归结果归档；新增设定编辑前置约束问题记录 | 已完成 | 代码层已判断模型主链应当可用，但缺少真实线上对话结果；设定编辑在缺少故事脉络时的前置约束未被单独记录 | 已确认 qwen / deepseek / longcat 新对话可用，旧对话模型锁定可用；新增“设定编辑未在缺少故事脉络时阻断并提示”的待修问题已归档，且与本轮版本统一主线隔离 | 否 |
| 2026-05-05-04 | 修复修改昵称后管理员入口丢失；本地自检 | 已完成 | 退出登录重登后后台完整可见，但修改昵称保存后“管理后台”入口消失，改回昵称也无法恢复 | 个人信息保存后改为强制以 `auth.me` 最新返回刷新本地 auth store；本地 build 与 web test 通过，等待线上热修复验证 | 否 |
| 2026-05-05-05 | 最终自检与收口范围复核 | 已完成 | 虽然此前已完成多轮自检，但在创建 GitHub 新基线前，仍需确认最终 build/test 后没有引入新的工作树噪声 | server lint、monorepo build、web test 全部通过；工作树仍稳定为 11 个代码文件 + 7 个文档/基线文件，排除项仍只有 `apps/web/next-env.d.ts` 与 `baseline-bundle.tgz` | 否 |

---

## 8. 提交前最终清单与管理员判定依据

### 8.1 建议纳入 GitHub 新统一基线的文件

#### 代码修复（11）
- `apps/server/src/routes/ai-stream-platform.ts`
- `apps/server/src/routes/api-v1.ts`
- `apps/server/src/services/ai-gateway/crypto.ts`
- `apps/server/src/services/token-relay/router.ts`
- `apps/server/src/services/token-relay/token-billing.ts`
- `apps/web/app/admin/layout.tsx`
- `apps/web/app/settings/profile/page.tsx`
- `apps/web/components/chat/chat-panel.tsx`
- `apps/web/lib/ai-stream.ts`
- `apps/web/next.config.js`
- `packages/ai-adapters/src/adapters/openai-compat.ts`

#### 文档 / 基线资产（7）
- `docs/release-self-check/2026-05-05-version-unification-worklog.md`
- `docs/release-self-check/baseline/2026-05-05-admin-regression-baseline.md`
- `docs/release-self-check/baseline/2026-05-05-baseline-index.md`
- `docs/release-self-check/baseline/2026-05-05-db-permission-baseline.txt`
- `docs/release-self-check/baseline/2026-05-05-github-baseline.txt`
- `docs/release-self-check/baseline/2026-05-05-local-working-tree.txt`
- `docs/release-self-check/baseline/2026-05-05-server-runtime-summary.txt`

### 8.2 明确排除项
- `apps/web/next-env.d.ts`
- `baseline-bundle.tgz`

排除理由：
- `apps/web/next-env.d.ts` 只是 Next 自动生成类型引用变化，不属于真实业务修复
- `baseline-bundle.tgz` 属于二进制归档证据，不应混入代码基线提交

### 8.3 暂缓项（不混入本轮统一版本）
来源：`工具开发/软件工具开发-skill/开发需求.md`

- longcat 渠道补充 API 的业务配置事项
- 已删除用户从管理员列表删除并清空后台占用
- Token 文案与用量展示调整
- longcat 免费额度统计口径补齐
- 站内用量统计柱状图展示优化
- 模板广场角色分类归类问题
- 设定编辑缺少故事脉络前置阻断

### 8.4 管理员角色判定依据

当前管理员身份判定链路是：
1. 登录 token 只签发 `userId`
2. 服务端每次进入管理员路由时，按 `userId` 回查数据库 `users.is_admin` 与 `users.admin_level`
3. 只有 `is_admin = true` 且 `admin_level` 满足对应级别要求时，才允许访问后台接口
4. 前端 Navbar / `/admin` 菜单只是可见性提示，真正权限裁决仍在服务端

对应代码依据：
- `apps/server/src/services/auth/utils.ts`
  - `generateToken(userId)` 只签 `userId`
  - `verifyToken()` 也只还原 `userId`
- `apps/server/src/trpc.ts`
  - `adminProcedure` 检查 `users.isAdmin`
  - `adminProcedureLevel(minLevel)` 进一步检查 `users.adminLevel`
  - `admin_level === null` 或级别不满足时直接拒绝

### 8.5 冒用风险边界结论
- **不能仅靠改昵称、改邮箱、改 displayId 冒充管理员**：因为这些字段不是管理员鉴权依据
- **不能靠前端 localStorage 菜单显示冒充管理员**：就算前端错误显示入口，后台接口仍会再次走服务端权限校验
- **真正风险边界在服务端账号与 token**：只有拿到管理员账号对应的有效 token，且数据库中该 `userId` 仍具备 `is_admin/admin_level`，才可能访问后台能力
- **本轮修复的价值** 是把资料更新后的前端权限快照重新与 `auth.me` 同步，避免“真管理员被前端错误降权”；并不是把管理员资格转移给资料字段

### 8.6 当前提交前状态结论
- 本地最终自检通过
- 收口范围稳定，无新增噪声
- 当前已处于“可创建 GitHub 新统一基线提交”的提交前状态
- 但截至本节记录，**尚未执行 git commit / git push**

### 8.7 建议提交信息（草案）

参考最近提交风格：
- `7b81d59 补充背景资源发布与上传说明`
- `042178f 固化部署修复并清理过期资源`
- `12ff976 优化登录与管理后台体验`
- `49a8cd6 chore: 清理平台残留配置，标准化 .gitignore`

建议本轮提交标题：
- `固化模型链路与管理员权限收口基线`

建议提交说明：
- 统一模型调用链中的 `provider/modelId` 与纯 `modelId` 口径，保住线上 qwen、deepseek、longcat 与会话模型绑定行为。
- 固化管理员权限刷新、自检台账与 baseline 证据，确保资料更新后不再误丢管理员状态，并为后续服务器 git 化提供可追溯基线。

### 8.8 提交前操作提示
- 暂存时只纳入 11 个代码文件 + 7 个文档/基线文件
- 不纳入：`apps/web/next-env.d.ts`
- 不纳入：`baseline-bundle.tgz`
- 提交完成后，再单独处理服务器 git 化与规范部署主链恢复

## 9. 服务器 git 化与规范部署主链恢复方案

### 9.1 当前状态
- 线上运行目录：`/root/Story-Edit`
- 当前目录 **不是 git 仓库**
- 当前线上服务可用，PM2 进程为：
  - `story-edit-server`
  - `story-edit-web`
- 当前可复用部署入口已存在：
  - `deploy.sh`
  - `ecosystem.config.cjs`
- 当前必须继续保留的服务器侧本地资产：
  - `.env`
  - `apps/web/public/backgrounds/`
- 当前数据库迁移策略仍为：**单独确认执行，不混入自动部署**

### 9.2 目标
把阿里云从“archive/scp 覆盖式发布”恢复为可追溯的标准主链：

`本地开发 -> GitHub push -> 服务器 git pull -> bash deploy.sh -> 冒烟验证`

同时保留资源双轨规则：
- 代码走 GitHub
- `apps/web/public/backgrounds/` 大文件继续手动上传，不进 Git 仓库

### 9.3 风险控制前提
在真正动服务器目录前，必须先满足：
1. 本轮统一版本已经在本地形成正式 git 提交
2. 该提交已经 push 到 GitHub
3. 线上当前可用目录已完成备份
4. `.env` 与背景资源目录已单独核对和保留
5. 不在 git 化切换步骤中自动执行 `pnpm db:migrate`

### 9.4 推荐实施顺序

#### 阶段 A：提交后先固化远端基线
1. 在本地创建本轮统一版本提交
2. push 到 GitHub
3. 记录提交 SHA，作为服务器 git 化目标版本

#### 阶段 B：服务器侧创建并验证新的 git 工作副本
推荐不要直接原地改 `/root/Story-Edit`，先建立并行目录，例如：
- `/root/Story-Edit.git`
- 或 `/root/story-edit-gitified`

推荐动作：
1. 从 GitHub clone 仓库到新目录
2. checkout 到本轮统一基线提交
3. 从当前线上目录复制 `.env` 到新目录
4. 从当前线上目录复制或挂接背景资源目录：
   - `/root/Story-Edit/apps/web/public/backgrounds/`
5. 在新目录执行：
   - `pnpm install --frozen-lockfile`
   - `pnpm build`
6. 用新目录中的 `ecosystem.config.cjs` 与 `deploy.sh` 做一次标准部署验证

#### 阶段 C：最小切换与冒烟验证
切换后必须立即验证：
- `curl http://127.0.0.1:3001/health`
- `curl http://127.0.0.1:3000`
- `curl "http://127.0.0.1:3000/trpc/template.list?..."`
- `pm2 status`
- 管理员后台入口 / `/admin/channels`
- qwen / deepseek / longcat 新对话

若全部通过，再把新目录视为正式线上工作副本。

### 9.5 回退方案
为避免 git 化过程中把当前可用线上版本直接打掉，回退手段必须提前保留：
- 保留当前 `/root/Story-Edit` 目录不删除
- 保留当前 `.env`
- 保留当前背景资源目录
- 保留当前 PM2 可运行配置
- 若新 git 工作副本验证失败：
  - 立即切回旧目录对应的 PM2 启动配置
  - 恢复旧目录作为正式运行目录

### 9.6 git 化完成后的长期规则
服务器 git 化完成后，后续标准流程固定为：
1. 本地开发并自检
2. Git 提交并 push GitHub
3. 服务器 `git pull`
4. 执行 `bash deploy.sh`
5. 执行固定冒烟检查
6. 如涉及背景资源，再单独 `scp` 上传到：
   - `/root/Story-Edit/apps/web/public/backgrounds/`

### 9.7 当前不作为 git 化阻断项的事项
- `deploy.sh` 健康检查过早导致的启动窗口假失败
- Next 16 `middleware` -> `proxy` 提示
- PM2 / pnpm 启动日志中的 `ELIFECYCLE` 噪声

这些事项可以后续单独优化，但不应阻塞“先恢复标准 git 部署主链”。

### 9.8 本次 git 化实施结果
- 服务器无法直接连通 GitHub：
  - HTTPS 访问 `github.com` 超时
  - SSH 访问 `git@github.com` 缺少可用 deploy key
- 因此本次先采用 **git bundle 引导 git 化**：
  - 本地创建 `story-edit-main.bundle`
  - 上传到服务器 `/root/story-edit-main.bundle`
  - 在服务器创建并行工作副本：`/root/story-edit-gitified`
- 已在并行工作副本中完成：
  - checkout 提交 `086adcae8637c66f57b725416d32ea2c4c25157b`
  - 复制 `.env`
  - 复制 `apps/web/public/backgrounds/`
  - `pnpm install --frozen-lockfile`
  - `pnpm build`
- 已将 PM2 正式切换到 git 化目录：
  - `story-edit-server` -> `/root/story-edit-gitified/apps/server`
  - `story-edit-web` -> `/root/story-edit-gitified/apps/web`
- 最终冒烟通过：
  - `3001/health` -> 200
  - `3000` -> 200
  - `template.list` -> 200
- 当前 git 化目录状态：
  - `git rev-parse HEAD` = `086adcae8637c66f57b725416d32ea2c4c25157b`
  - `origin` 已改写为 `https://github.com/nhx0321/Story-Edit.git`
- 当前残留噪声项：
  - `apps/web/next-env.d.ts`
  - `apps/web/public/backgrounds/`（按既定双轨规则保留为服务器本地资源，不纳入 Git）

### 9.9 当前未闭合项
- 服务器到 GitHub 的直连能力尚未恢复，因此后续若要真正执行 `git pull`，仍需补一项：
  - 修通服务器到 GitHub 的 HTTPS 网络访问，或
  - 为服务器配置可用的 GitHub SSH deploy key
- 在这一步闭合前，服务器已经具备“git 工作副本 + 标准 deploy.sh + PM2 标准路径”的结构，但更新代码仍需通过 bundle / 手工同步过渡

### 9.10 GitHub 直连能力补通结果
- 已为服务器新增仓库 deploy key，并写入服务器 SSH 配置：
  - `/root/.ssh/story-edit-github-deploy`
  - `/root/.ssh/config`
- 已验证服务器可通过 SSH 访问 GitHub 仓库：
  - `ssh -T git@github.com` 成功返回仓库级身份提示
- 已将 git 化目录 `origin` 改为：
  - `git@github.com:nhx0321/Story-Edit.git`
- 已完成并验证：
  - `git ls-remote origin HEAD`
  - `git fetch origin`
  - `git branch --set-upstream-to=origin/main main`
  - `git pull --ff-only origin main`
- 当前服务器 git 工作副本已与 GitHub `main` 对齐：
  - `HEAD = origin/main = 086adcae8637c66f57b725416d32ea2c4c25157b`
- 补通后再次验证服务：
  - `3001/health` -> 200
  - `3000` -> 200
  - `template.list` -> 200

### 9.11 当前最终状态
- 服务器已同时满足：
  - git 工作副本运行
  - `origin` 直连 GitHub
  - 可执行 `git pull`
  - 可执行 `bash deploy.sh`
  - PM2 在线
  - 固定冒烟检查通过
- 当前真正遗留项只剩常规优化项，不再影响“版本统一 + 标准发布主链恢复”这一主目标

### 9.12 统计修复版本发布结果（commit `147be667ddca59d9a96e0962722541c7af48db7a`）
- 本次发布目标：
  - 用户今日消耗改按 `todayTokens`
  - 模型消耗分布不再依赖 `totalCost > 0`
  - 渠道详情页今日/累计/月度消耗统一按 input + output token 展示
  - 运行包中带上 `channelId` / `requestId` / `todayTokens` / `getChannelDetail(channelId)` 新逻辑
- 本地已完成：
  - `pnpm --filter @story-edit/server lint`
  - `pnpm --dir "E:/Story Edit/工具开发/项目/story-edit" build`
  - `pnpm --filter @story-edit/web test`
- GitHub 发布：
  - 本地 commit: `147be667ddca59d9a96e0962722541c7af48db7a`
  - 已 push 到 `origin/main`
- 服务器执行：
  - `cd /root/story-edit-gitified`
  - `git pull --ff-only origin main`
  - `bash deploy.sh`
- 发布过程说明：
  - `deploy.sh` 内嵌的首轮 `curl 127.0.0.1:3001/health` 在 PM2 reload 后短暂命中启动窗口，返回 `curl: (7) Failed to connect to 127.0.0.1 port 3001`
  - 随后人工复检确认服务已正常监听，这次应记为**启动窗口假失败**，不作为真实发布失败结论
- 发布后复检：
  - `3001/health` -> 200
  - `3000` -> 200
  - `template.list` -> 200
- PM2 真实运行目录：
  - `story-edit-server` -> `/root/story-edit-gitified/apps/server`
  - `story-edit-web` -> `/root/story-edit-gitified/apps/web`
- 运行包静态标记确认：
  - server `dist/index.mjs` 已包含 `channelId` / `requestId` / `todayTokens`
  - server `dist/index.mjs` 已包含 `getChannelDetail` 按 `tokenConsumptionLogs.channelId` 聚合逻辑
  - web `tokens` 页面构建产物已包含新文案与 `todayTokens` 使用
- 当前数据库观察：
  - 最近 10 条 `token_consumption_logs` 仍均为 2026-05-04 的旧 longcat 日志
  - 这些旧日志 `channel_id/request_id` 为空，不能用于判断新版本是否失败
- 当前待下一阶段统一人工验证：
  - 生成发布后的新 longcat / qwen / deepseek 请求
  - 检查新日志 `channel_id/request_id` 是否写入
  - 检查 `/admin/channels/[id]` 与 `/ai-config/tokens` 展示口径是否一致

### 9.13 背景资源上传链路与结果（2026-05-06）
- 背景资源继续遵守双轨规则：
  - 代码与配置走 GitHub / `git pull --ff-only`
  - 大文件背景资源走本地直传服务器，不纳入 Git 仓库
- 本次上传源目录：
  - `E:/Story Edit/工具开发/项目/story-edit/apps/web/public/backgrounds`
- 本次上传目标目录：
  - `/root/story-edit-gitified/apps/web/public/backgrounds`
- 实际上传文件共 5 组：
  - `grassland.mp4` / `grassland.jpg`
  - `pool.mp4` / `pool.jpg`
  - `snow mountain.mp4` / `snow mountain.jpg`
  - `under tree.mp4` / `under tree.jpg`
  - `yard.mp4` / `yard.jpg`
- 上传后执行：
  - 重启 `story-edit-web`
  - 核对服务器目录中文件在位且大小正常
  - 服务器本机访问静态资源：
    - `/backgrounds/grassland.jpg` -> 200
    - `/backgrounds/grassland.mp4` -> 200
    - `/backgrounds/snow%20mountain.jpg` -> 200
- 结果结论：
  - 新背景静态资源已进入真实运行目录并生效
  - 服务器目录中的旧背景文件仍保留，但前台会按后台已注册的新 `fileName` 读取，不构成版本分叉
  - 用户已完成前台刷新验证，当前背景上线链路闭合

## 10. 本文档后续追加规则
- 每次新增代码修改后，在“变更 / 验证 / 回退对照表”追加一行
- 每次完成一轮验证后，在“执行记录”新增一个小节
- 若发生回退，必须写明：回退触发点、回退前版本、回退后结果、未解决残留
