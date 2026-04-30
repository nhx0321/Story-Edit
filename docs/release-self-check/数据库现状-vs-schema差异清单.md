# Story Edit 数据库现状 vs schema.ts 差异清单

更新时间：2026-04-30
比对对象：

- 目标声明：`apps/server/src/db/schema.ts`
- 实际数据库：本地 `story_edit`

目的：为后续 reconciliation migrations 提供可执行差异表。

## 0. 最新进展（本轮已落地）

基于本清单识别出的高优先级差异，已完成第一批 append-only reconciliation migrations：

- `0039_content_fingerprints_reconciliation.sql`
  - 正式接管 `content_fingerprints`
  - 补齐 `template_id` 唯一约束
  - 对应运行时实现已不再依赖 `CREATE TABLE IF NOT EXISTS`
- `0040_token_numeric_reconciliation.sql`
  - 将 `model_pricing.input_price_per_1m / output_price_per_1m` 对齐到 `bigint`
  - 将 `token_consumption_logs.input_tokens / output_tokens / cache_hit_tokens` 对齐到 `bigint`
- `0041_ai_configs_default_reconciliation.sql`
  - 正式固化 `ai_configs.is_default`
  - 正式接管 `enforce_single_default_config` 函数、触发器与“每用户最多一个默认配置”唯一索引

## 1. 总结结论

本轮比对结果显示：

1. **表层面整体接近对齐**，绝大多数 `schema.ts` 中声明的表在数据库中都存在
2. **`content_fingerprints` 已完成正式入链**，不再属于游离运行时建表
3. **枚举层面已对齐**，未发现 schema 与数据库缺失/多余枚举
4. **首批关键类型口径差异已完成迁移治理**，token 相关核心漂移已进入正式 reconciliation migration
5. **首批关键约束来源不一致已完成治理**，`ai_configs` 默认配置约束已不再只依赖 orphan 历史

结论上，当前剩余的 reconciliation 工作已经从“补表/补关键约束”收缩为：

- 导出完整数据库结构快照
- 建立 migration 文件状态矩阵
- 识别保留旧表与未来要剥离的旧表

## 2. 表级差异

## 2.1 schema.ts 已声明且数据库已存在的表
当前绝大多数核心表已经存在，包括：

- 用户/认证：`users`、`password_reset_tokens`
- 项目/创作主链：`projects`、`volumes`、`units`、`chapters`、`chapter_versions`
- 梗概/设定：`outline_versions`、`settings`、`setting_relationships`、`settings_deliveries`
- AI 交互：`ai_configs`、`ai_roles`、`conversations`、`conversation_messages`、`ai_usage_logs`
- 模板：`templates`、`template_versions`、`template_comments`、`template_likes`、`template_purchases`、`template_ratings`、`user_templates`
- Token 中转站：`api_channels`、`model_pricing`、`user_token_accounts`、`token_consumption_logs`、`user_api_keys`、`user_subscriptions`、`token_recharge_orders`、`token_packages`
- 管理/反馈：`admin_audit_logs`、`feedbacks`、`notifications`
- 故事脉络/经验：`story_narratives`、`edit_logs`、`chapter_analysis`
- 旧订阅/旧 sprite：相关表也都还在

## 2.2 数据库中存在，但 `schema.ts` 未声明的表

本项已关闭。

`content_fingerprints` 已通过以下动作正式纳入治理：

- `schema.ts` 已声明 `contentFingerprints`
- `0039_content_fingerprints_reconciliation.sql` 已追加到正式对账链
- `template_id` 唯一约束已被正式表达
- 运行时代码已改为使用正式 schema，不再依赖 `CREATE TABLE IF NOT EXISTS`

## 3. 枚举级差异

### 3.1 已确认对齐的枚举
数据库与 `schema.ts` 当前一致：

- `ai_provider`
- `conversation_type`
- `feedback_status`
- `genre`
- `memory_level`
- `project_type`
- `sprite_ai_task_status`
- `sprite_ai_task_type`
- `sprite_companion_style`
- `sprite_text_status`
- `sprite_text_type`
- `subscription_status`
- `template_audit_status`
- `template_source`

### 3.2 特别说明
虽然枚举集合当前一致，但它们的历史来源并不干净，仍然需要记在治理背景里：

- `project_type` 与 `genre` 的扩展来自多份重叠 migration
- `ai_provider` 的裁剪来自 orphan migration

当前可视为“现状正确，历史脏乱”。

## 4. 关键列类型差异

这是本轮最重要的技术差异。

## 4.1 `model_pricing`
本项已通过 `0040_token_numeric_reconciliation.sql` 处理。

### schema.ts 声明
- `input_price_per_1m`: `bigint`
- `output_price_per_1m`: `bigint`

### 对账动作
- 将数据库中的 `input_price_per_1m` 从 `int4` 升级为 `bigint`
- 将数据库中的 `output_price_per_1m` 从 `int4` 升级为 `bigint`

### 当前判定
- 该项不再属于未闭合差异
- 后续只需在真实数据库执行迁移后做一次结构复核

## 4.2 `token_consumption_logs`
本项已通过 `0040_token_numeric_reconciliation.sql` 处理。

### schema.ts 声明
- `input_tokens`: `bigint`
- `output_tokens`: `bigint`
- `cache_hit_tokens`: `bigint`

### 对账动作
- 将数据库中的 `input_tokens` 从 `int4` 升级为 `bigint`
- 将数据库中的 `output_tokens` 从 `int4` 升级为 `bigint`
- 将数据库中的 `cache_hit_tokens` 从 `int4` 升级为 `bigint`

### 当前判定
- 该项不再属于未闭合差异
- 后续只需在真实数据库执行迁移后做一次结构复核

## 4.3 其余 token 体系核心字段
以下字段数据库与 schema.ts 当前基本一致：

- `api_channels.daily_limit / daily_used`: `int8`
- `user_token_accounts.balance / total_consumed / total_recharged / daily_limit / daily_used`: `int8`
- `token_recharge_orders.token_amount`: `int8`
- `token_packages.token_quota`: `int8`
- `user_subscriptions.token_quota_total / token_quota_used`: `int8`
- `token_consumption_logs.cost`: `int8`

说明：
- 差异集中在“价格字段”和“单次 token 计数字段”，不是全套 token 系统都错

## 5. 约束与索引差异

## 5.1 `content_fingerprints` 约束与代码不一致
本项已关闭。

已完成：
- `content_fingerprints.template_id` 唯一约束正式入迁移链
- 代码已切换为正式 schema upsert 实现

## 5.2 `model_pricing` 唯一约束正确
数据库当前：
- 主键：`id`
- 唯一约束：`(provider, model_id)`

与 `0032_token_system.sql` 的目标一致。

## 5.3 `user_token_accounts` 唯一约束正确
数据库当前：
- 主键：`id`
- 唯一约束：`user_id`

与 `schema.ts` 一致。

## 5.4 `ai_configs` 触发器不在 schema.ts 中
本项已通过 `0041_ai_configs_default_reconciliation.sql` 收口。

已完成：
- 正式固化 `enforce_single_default_config` 函数
- 正式固化 `trg_enforce_single_default`
- 增加部分唯一索引 `idx_ai_configs_one_default_per_user`
- 运行时写入逻辑已同步调整为事务式收口

当前判定：
- 该约束不再只是 orphan migration 的残留行为
- 已进入正式 reconciliation 治理范围

## 6. 旧体系残留表
数据库当前仍保留大量旧体系表，例如：

- `subscriptions`
- `subscription_orders`
- `recharge_orders`
- `withdrawal_requests`
- `user_sprites`
- `sprite_text_entries`
- 以及相关 sprite / bean / shop 生态表

这些表在 `schema.ts` 中也仍有声明，因此它们不属于“schema 缺失”，而属于：

- **产品语义上部分已退场**
- **数据库结构上仍然合法存在**

本轮已补充专项策略文档：
- `docs/release-self-check/旧体系表保留策略清单.md`

当前分组结论：

1. **运行中，保留为现行表**
   - `user_sprites`
   - `sprite_bean_transactions`
   - `recharge_orders`
2. **冻结保留，不再扩域**
   - `subscriptions`
   - `subscription_orders`
   - `withdrawal_requests`
3. **候删观察组**
   - `sprite_images`
   - `sprite_items`
   - `user_sprite_items`
   - `sprite_conversations`
   - `sprite_interaction_log`
   - `sprite_text_entries`
   - `sprite_ai_tasks`

结论上，reconciliation 阶段仍不建议直接删表；应先完成代码依赖拆除、数据备份和双路径验证，再通过新的 append-only migration 落地下线动作。

## 7. reconciliation 任务表

### P0 - 已完成对账项
#### 1) 正式纳入 `content_fingerprints`
已完成动作：
- 在 `schema.ts` 中声明 `contentFingerprints`
- 明确 `template_id UNIQUE`
- 通过 `0039_content_fingerprints_reconciliation.sql` 接管该表
- 运行时代码不再依赖 `CREATE TABLE IF NOT EXISTS`

#### 2) 统一 `model_pricing` 价格字段类型
已完成动作：
- 通过 `0040_token_numeric_reconciliation.sql` 将数据库字段升级为 `bigint`

#### 3) 统一 `token_consumption_logs` token 计数字段类型
已完成动作：
- 通过 `0040_token_numeric_reconciliation.sql` 将 `input_tokens / output_tokens / cache_hit_tokens` 升级为 `bigint`

### P1 - 已完成规范项
#### 4) 把 `ai_configs` 默认配置触发器纳入正式治理
已完成动作：
- 保留 DB trigger 方案
- 通过 `0041_ai_configs_default_reconciliation.sql` 固化函数、触发器和唯一索引
- 让 schema 背景、migration 治理、runtime 写入口径一致

### P2 - 后续治理项
#### 5) 形成“旧表保留策略清单”
动作：
- 对订阅、提现、sprite 相关表逐个标注：运行中 / 冻结 / 候删

#### 6) 导出完整 schema 快照
动作：
- 生成数据库对象全量快照，作为后续迁移前后比对基线

#### 7) 建立 migration 文件状态矩阵
动作：
- 对每个 migration 标记 official / orphan_applied / superseded / unsafe

## 8. 当前建议的实际推进顺序

1. 先执行 `0039 / 0040 / 0041` 到目标数据库
2. 导出迁移前后 schema 快照做结构复核
3. 建立旧体系表保留策略清单
4. 再建立 migration 文件状态矩阵

## 9. 一句话结论

当前数据库和 `schema.ts` 的主要矛盾，已经从“缺表缺枚举 + 关键约束漂移”收缩为：

- 一批追加 reconciliation migration 需要在真实目标库执行并复核
- 一批旧体系对象仍需从“存在”走向“有明确保留策略”
- 一套 migration 状态矩阵仍需补齐，便于后续长期治理

这说明 reconciliation 已经从“识别关键差异”进入了“首批差异已落地、剩余治理继续收口”的阶段。
