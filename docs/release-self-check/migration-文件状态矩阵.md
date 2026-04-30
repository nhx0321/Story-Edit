# Story Edit migration 文件状态矩阵

更新时间：2026-04-30
范围：`apps/server/src/db/migrations/*.sql`
判定基线：

- `apps/server/src/db/migrations/meta/_journal.json`
- `docs/release-self-check/迁移链审计与治理建议.md`
- `docs/release-self-check/迁移链取证结果与对账清单.md`
- `docs/release-self-check/数据库现状-vs-schema差异清单.md`
- 本地 `story_edit` 数据库执行 `0039 / 0040 / 0041` 后的结构快照

## 1. 状态标签说明

- `official`：已在 `_journal.json` 中登记，属于已知正式链
- `orphan_but_applied`：未在 journal 中，但数据库已确认存在其目标结构
- `orphan_unknown`：未在 journal 中，当前仅能确认文件存在，尚未逐项完成数据库事实映射
- `superseded`：其目标状态已被正式链或后续更大迁移覆盖，不应再作为独立执行依据
- `unsafe_to_replay`：存在重复编号、内容重叠、依赖倒挂或高概率重复 DDL，不能直接补进线性历史
- `reconciliation`：本轮新增的 append-only 对账迁移

## 2. 当前矩阵

| 文件 | 状态 | 理由 |
|---|---|---|
| `0000_safe_the_liberteens.sql` | `official` | 已在 `_journal.json` 中登记。 |
| `0001_broad_spyke.sql` | `official` | 已在 `_journal.json` 中登记。 |
| `0002_version_and_conversations.sql` | `official` | 已在 `_journal.json` 中登记。 |
| `0003_project_soft_delete.sql` | `official` | 已在 `_journal.json` 中登记。 |
| `0004_busy_epoch.sql` | `official` | 已在 `_journal.json` 中登记，是当前正式链中的 `0004`。 |
| `0004_outline_soft_delete.sql` | `unsafe_to_replay` | 与正式 `0004_busy_epoch.sql` 重号，不可直接补回线性链。 |
| `0005_lame_doctor_spectrum.sql` | `official` | 已在 `_journal.json` 中登记，是当前正式链末端。 |
| `0005_remove_claude_openai_provider.sql` | `orphan_but_applied` | 数据库中的 `ai_provider` 已反映其目标状态，但文件未入 journal。 |
| `0006_templates_user_enhancements.sql` | `orphan_unknown` | 未入 journal，需后续逐项对照数据库结构确认。 |
| `0007_outline_versions.sql` | `orphan_but_applied` | `outline_versions` 表和索引已在数据库中存在。 |
| `0007_template_system_v2.sql` | `orphan_unknown` | 未入 journal，且与模板体系后续迁移可能重叠，需专项取证。 |
| `0008_admin_role.sql` | `orphan_unknown` | 未入 journal，数据库中已有管理字段，但尚未在本轮文档中单独标定。 |
| `0009_ai_default_config.sql` | `orphan_but_applied` | `ai_configs.is_default`、触发器函数和触发器已存在；本轮又被 `0041` 正式接管。 |
| `0009_disclaimer.sql` | `orphan_unknown` | `disclaimers` 表已存在，但需区分与 `0005_lame_doctor_spectrum.sql` 的覆盖关系。 |
| `0009_preferred_model.sql` | `unsafe_to_replay` | 明确依赖倒挂：其依赖的 `user_token_accounts` 要到 `0032_token_system.sql` 才创建。 |
| `0010_subscription_orders.sql` | `orphan_unknown` | 旧订阅体系文件，需结合旧表保留策略再定。 |
| `0011_sprites.sql` | `orphan_unknown` | 旧 sprite 体系文件，仍需和数据库残留依赖一起审计。 |
| `0012_sprite_bean_value.sql` | `orphan_unknown` | 旧 sprite/bean 体系文件，尚未单独取证。 |
| `0013_sprite_ai_interaction.sql` | `orphan_unknown` | 旧 sprite AI 交互体系文件，尚未单独取证。 |
| `0014_admin_enhancements.sql` | `orphan_unknown` | 未入 journal，需后续映射数据库对象。 |
| `0015_fix_admin.sql` | `orphan_unknown` | 未入 journal，需后续映射数据库对象。 |
| `0016_shop_enhancements.sql` | `orphan_unknown` | 旧商店体系文件，需与旧表策略一起判断。 |
| `0017_art_assets.sql` | `orphan_unknown` | `art_assets` 表存在，但尚未拆分确认是否完全由此文件投影。 |
| `0018_sprite_text_management.sql` | `orphan_unknown` | 旧 sprite text 体系文件，尚未单独取证。 |
| `0019_sprite_bean.sql` | `orphan_unknown` | 旧 sprite bean 体系文件，尚未单独取证。 |
| `0020_shop_items.sql` | `orphan_unknown` | 旧 shop 体系文件，尚未单独取证。 |
| `0021_add_last_active_at.sql` | `orphan_but_applied` | `users.last_active_at` 已存在。 |
| `0021_genre_presets.sql` | `orphan_but_applied` | `genre_presets` 已存在，但其语义已与 `0005_lame_doctor_spectrum.sql` 重叠。 |
| `0021_swap_items.sql` | `orphan_unknown` | 旧体系文件，需与 shop/sprite 保留策略一起判断。 |
| `0022_fix_genre_tag_type.sql` | `orphan_but_applied` | `projects.genre_tag` 已是 `varchar`。 |
| `0022_project_types_expansion.sql` | `orphan_but_applied` | `project_type` 已包含扩展值。 |
| `0022_seed_sprite_texts.sql` | `orphan_unknown` | 旧 sprite text seed 文件，需与旧体系治理联动判断。 |
| `0023_template_soft_delete.sql` | `orphan_unknown` | 模板体系后续文件，尚未单独映射数据库事实。 |
| `0024_template_ai_roles.sql` | `orphan_unknown` | 模板/AI 角色体系文件，尚未单独映射数据库事实。 |
| `0025_sprite_guide_reward.sql` | `orphan_unknown` | 旧 sprite 奖励体系文件，需与旧表策略一起判断。 |
| `0026_setting_relationships.sql` | `orphan_unknown` | `setting_relationships` 已在 schema 中，但本轮未单独取证来源。 |
| `0027_story_narratives.sql` | `orphan_unknown` | `story_narratives` 已存在，但本轮未单独取证来源。 |
| `0028_settings_deliveries.sql` | `orphan_unknown` | `settings_deliveries` 已存在，但本轮未单独取证来源。 |
| `0029_edit_logs.sql` | `orphan_unknown` | `edit_logs` 已存在，但本轮未单独取证来源。 |
| `0030_feedbacks_notifications.sql` | `orphan_unknown` | `feedbacks/notifications` 属较晚期结构，但未入 journal。 |
| `0031_password_reset_tokens.sql` | `orphan_unknown` | `password_reset_tokens` 已在 schema 中，未入 journal。 |
| `0032_token_system.sql` | `orphan_but_applied` | token relay 整套核心表、索引和约束已在数据库存在。 |
| `0033_seed_token_data.sql` | `orphan_unknown` | 偏数据 seed 文件，不应直接按结构迁移状态类比。 |
| `0034_writing_style.sql` | `orphan_unknown` | `projects.writing_style` 已存在，但本轮未单独标定来源。 |
| `0035_experience_update_count.sql` | `orphan_unknown` | 经验库相关增量文件，未入 journal。 |
| `0036_chapter_analysis.sql` | `orphan_unknown` | `chapter_analysis` 已在 schema 中，未单独取证来源。 |
| `0037_user_role.sql` | `orphan_but_applied` | `users.user_role` 已存在。 |
| `0038_genre_preset_project_type.sql` | `orphan_but_applied` | `genre_presets.project_type` 已存在。 |
| `0039_content_fingerprints_reconciliation.sql` | `reconciliation` | 本轮新增 append-only 对账迁移，已在本地库执行。 |
| `0040_token_numeric_reconciliation.sql` | `reconciliation` | 本轮新增 append-only 对账迁移，已在本地库执行。 |
| `0041_ai_configs_default_reconciliation.sql` | `reconciliation` | 本轮新增 append-only 对账迁移，已在本地库执行。 |

## 3. 当前重点观察

### 3.1 明确不可直接补历史的文件
以下文件当前至少应视为 **不可直接补进旧线性链**：

- `0004_outline_soft_delete.sql`
- `0009_preferred_model.sql`
- 与 `0005_lame_doctor_spectrum.sql` 存在明显结构重叠的一批文件：
  - `0007_outline_versions.sql`
  - `0021_genre_presets.sql`
  - `0021_add_last_active_at.sql`
  - `0022_project_types_expansion.sql`
  - `0022_fix_genre_tag_type.sql`

其中：
- `0009_preferred_model.sql` 更适合直接标为 `unsafe_to_replay`
- 上述重叠文件即便数据库已吸收目标状态，也不等于还能被安全重放

### 3.2 首批 canonical 追加链已形成
当前可视为“正式追加治理链”的文件：

- `0039_content_fingerprints_reconciliation.sql`
- `0040_token_numeric_reconciliation.sql`
- `0041_ai_configs_default_reconciliation.sql`

这三条迁移的作用不是补写旧历史，而是：

- 接管运行时游离结构
- 收敛 schema 与数据库之间的类型漂移
- 固化仍需保留的数据库级约束行为

## 4. 当前仍需继续细化的部分

以下文件当前仍主要处于 `orphan_unknown`，后续应继续按域分组对账：

1. 模板/创作主链后期文件
- `0006_templates_user_enhancements.sql`
- `0007_template_system_v2.sql`
- `0023_template_soft_delete.sql`
- `0024_template_ai_roles.sql`
- `0026_setting_relationships.sql`
- `0027_story_narratives.sql`
- `0028_settings_deliveries.sql`
- `0029_edit_logs.sql`
- `0034_writing_style.sql`
- `0035_experience_update_count.sql`
- `0036_chapter_analysis.sql`

2. 旧 sprite / shop / subscription 体系文件
- `0010_subscription_orders.sql`
- `0011_sprites.sql`
- `0012_sprite_bean_value.sql`
- `0013_sprite_ai_interaction.sql`
- `0016_shop_enhancements.sql`
- `0018_sprite_text_management.sql`
- `0019_sprite_bean.sql`
- `0020_shop_items.sql`
- `0021_swap_items.sql`
- `0022_seed_sprite_texts.sql`
- `0025_sprite_guide_reward.sql`

## 5. 一句话结论

当前 migration 文件矩阵已经能清楚区分三类对象：

- 少量仍可作为“已知正式链”参考的 `official`
- 大量只能被视作“已投影到现实数据库，但不可安全重放”的 `orphan_but_applied / unsafe_to_replay`
- 一组真正承担后续治理职责的 `reconciliation` 追加迁移
