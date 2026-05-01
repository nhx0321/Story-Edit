import { pgTable, text, timestamp, varchar, boolean, integer, jsonb, pgEnum, uuid, decimal, bigint } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ========== 枚举 ==========

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trial', 'free', 'premium', 'expired',
]);

export const projectTypeEnum = pgEnum('project_type', [
  'novel', 'webnovel', 'screenplay', 'prompt_gen',
]);

export const memoryLevelEnum = pgEnum('memory_level', [
  'L0', 'L1', 'L2', 'L3', 'L4',
]);

export const aiProviderEnum = pgEnum('ai_provider', [
  'deepseek', 'longcat', 'qwen', 'custom',
]);

export const genreEnum = pgEnum('genre', [
  'xianxia', 'urban', 'apocalypse', 'romance', 'military',
  'political', 'scifi', 'suspense', 'fantasy', 'historical',
  'game', 'male_oriented', 'female_oriented', 'other',
  'serious_literature', 'historical_literature', 'children_literature',
  'detective_novel', 'social_realism', 'wuxia_novel',
  'historical_novel', 'historical_webnovel', 'ancient_romance',
  'modern_romance', 'sweet_pet', 'entertainment',
  'quick_transmigration', 'xianxia_romance', 'palace_intrigue',
  'movie_drama', 'web_drama', 'short_drama', 'family_ethics',
]);

// ========== 用户 ==========

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique(),
  phone: varchar('phone', { length: 20 }).unique(),
  passwordHash: text('password_hash').notNull(),
  nickname: varchar('nickname', { length: 100 }),
  avatarUrl: text('avatar_url'),
  inviteCode: varchar('invite_code', { length: 20 }).unique(),
  referredByCode: varchar('referred_by_code', { length: 20 }),
  displayId: varchar('display_id', { length: 12 }).unique(),
  userRole: varchar('user_role', { length: 20 }).default('free'),
  isAdmin: boolean('is_admin').default(false).notNull(),
  adminLevel: integer('admin_level'),
  bannedFromPublish: boolean('banned_from_publish').default(false),
  bannedFromPayment: boolean('banned_from_payment').default(false),
  trialDaysEarned: integer('trial_days_earned').default(0),
  lastCheckinAt: timestamp('last_checkin_at'),
  checkinStreak: integer('checkin_streak').default(0),
  lastActiveAt: timestamp('last_active_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== 订阅 ==========

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  status: subscriptionStatusEnum('status').notNull().default('free'),
  trialEndsAt: timestamp('trial_ends_at'),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 订阅订单 ==========

export const subscriptionOrders = pgTable('subscription_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  plan: varchar('plan', { length: 50 }).notNull(),
  amount: integer('amount').notNull(),
  paymentMethod: varchar('payment_method', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  refundAmount: integer('refund_amount').notNull().default(0),
  transactionId: varchar('transaction_id', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== AI 配置 ==========

export const aiConfigs = pgTable('ai_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  provider: aiProviderEnum('provider').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  apiKey: text('api_key_encrypted').notNull(),
  baseUrl: text('base_url'),
  defaultModel: varchar('default_model', { length: 100 }),
  isDefault: boolean('is_default').default(false),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 项目 ==========

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: varchar('name', { length: 200 }).notNull(),
  type: projectTypeEnum('type').notNull().default('novel'),
  genre: varchar('genre', { length: 100 }),
  genreTag: varchar('genre_tag', { length: 100 }),
  style: varchar('style', { length: 100 }),
  methodology: varchar('methodology', { length: 100 }),
  config: jsonb('config').$type<Record<string, unknown>>(),
  writingStyle: jsonb('writing_style').$type<Record<string, string>>().default({}),
  status: varchar('status', { length: 20 }).default('active'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== 卷 → 单元 → 章节 ==========

export const volumes = pgTable('volumes', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  title: varchar('title', { length: 200 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  synopsis: text('synopsis'),
  status: varchar('status', { length: 20 }).default('active'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const units = pgTable('units', {
  id: uuid('id').primaryKey().defaultRandom(),
  volumeId: uuid('volume_id').notNull().references(() => volumes.id),
  title: varchar('title', { length: 200 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  synopsis: text('synopsis'),
  structure: varchar('structure', { length: 50 }).default('four_act'),
  status: varchar('status', { length: 20 }).default('active'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const chapters = pgTable('chapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: uuid('unit_id').notNull().references(() => units.id),
  title: varchar('title', { length: 200 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  synopsis: text('synopsis'),
  status: varchar('status', { length: 20 }).default('draft'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const chapterVersions = pgTable('chapter_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  chapterId: uuid('chapter_id').notNull().references(() => chapters.id),
  content: text('content').notNull(),
  versionNumber: integer('version_number').notNull().default(1),
  parentVersionId: uuid('parent_version_id'),
  subVersionNumber: integer('sub_version_number').default(0),
  versionType: varchar('version_type', { length: 20 }).default('draft'), // task_brief / draft / final
  status: varchar('status', { length: 20 }).default('active'), // active / archived / deleted
  label: varchar('label', { length: 200 }),
  sourceChapterId: uuid('source_chapter_id'),
  isFinal: boolean('is_final').default(false),
  wordCount: integer('word_count').default(0),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 大纲版本表（卷/单元/章节梗概的版本管理）
export const outlineVersions = pgTable('outline_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: varchar('entity_type', { length: 20 }).notNull(), // volume / unit / chapter
  entityId: uuid('entity_id').notNull(),
  synopsis: text('synopsis').notNull(),
  versionNumber: integer('version_number').notNull().default(1),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 修改日志表（记录所有 AI 修改的变更历史）
export const editLogs = pgTable('edit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  entityType: varchar('entity_type', { length: 20 }).notNull(), // volume | unit | chapter | setting
  entityId: uuid('entity_id').notNull(),
  fieldName: varchar('field_name', { length: 50 }).notNull(), // synopsis | content | title
  oldValue: text('old_value'),
  newValue: text('new_value'),
  editReason: text('edit_reason'),
  aiRole: varchar('ai_role', { length: 50 }), // editor | setting_editor
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 故事脉络 ==========

export const storyNarratives = pgTable('story_narratives', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== 设定 ==========

export const settings = pgTable('settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  category: varchar('category', { length: 100 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  content: text('content').notNull(),
  sortOrder: integer('sort_order').default(0),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 设定关系（词条之间的连线关系）
export const settingRelationships = pgTable('setting_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  sourceId: uuid('source_id').notNull(),
  targetId: uuid('target_id').notNull(),
  relationType: varchar('relation_type', { length: 30 }).notNull(), // ally / enemy / belongs / location / item / family / other
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 设定交付（设定编辑完成全部设定后，生成结构化交付文档）
export const settingsDeliveries = pgTable('settings_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  title: text('title').notNull(),
  content: jsonb('content').$type<Record<string, unknown>>().notNull(),
  conversationId: uuid('conversation_id').references(() => conversations.id),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// ========== AI 角色 ==========

export const aiRoles = pgTable('ai_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: varchar('name', { length: 100 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  systemPrompt: text('system_prompt').notNull(),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 记忆 ==========

export const memoryEntries = pgTable('memory_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  level: memoryLevelEnum('level').notNull(),
  category: varchar('category', { length: 100 }),
  content: text('content').notNull(),
  updateCount: integer('update_count').notNull().default(1),
  sourceChapterId: uuid('source_chapter_id').references(() => chapters.id),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== 质检报告 ==========

export const qualityReports = pgTable('quality_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  chapterVersionId: uuid('chapter_version_id').notNull().references(() => chapterVersions.id),
  checkResults: jsonb('check_results').$type<Record<string, unknown>>(),
  score: integer('score'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== AI 用量统计 ==========

export const aiUsageLogs = pgTable('ai_usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  projectId: uuid('project_id').references(() => projects.id),
  provider: aiProviderEnum('provider').notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 伏笔追踪 ==========

export const foreshadows = pgTable('foreshadows', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  plantedChapterId: uuid('planted_chapter_id').references(() => chapters.id),
  resolvedChapterId: uuid('resolved_chapter_id').references(() => chapters.id),
  status: varchar('status', { length: 20 }).default('planted'), // planted | resolved | abandoned
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 物资/道具追踪 ==========

export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  characterId: varchar('character_id', { length: 100 }),
  name: varchar('name', { length: 200 }).notNull(),
  quantity: integer('quantity').default(1),
  status: varchar('status', { length: 20 }).default('active'), // active | consumed | lost
  lastMentionedChapterId: uuid('last_mentioned_chapter_id').references(() => chapters.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== 角色状态快照 ==========

export const characterStates = pgTable('character_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  characterName: varchar('character_name', { length: 100 }).notNull(),
  chapterId: uuid('chapter_id').references(() => chapters.id),
  state: jsonb('state').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== AI 对话 ==========

export const conversationTypeEnum = pgEnum('conversation_type', [
  'outline', 'settings', 'chapter',
]);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  type: conversationTypeEnum('type').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  targetEntityId: uuid('target_entity_id'),
  targetEntityType: varchar('target_entity_type', { length: 50 }),
  roleKey: varchar('role_key', { length: 50 }).notNull(),
  workflowStepId: varchar('workflow_step_id', { length: 50 }),
  modelId: varchar('model_id', { length: 100 }),
  status: varchar('status', { length: 20 }).default('active'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const conversationMessages = pgTable('conversation_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id),
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content').notNull(),
  actionType: varchar('action_type', { length: 50 }),
  actionPayload: jsonb('action_payload').$type<Record<string, unknown>>(),
  tokenCount: integer('token_count').default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 关系定义 ==========

export const usersRelations = relations(users, ({ many, one }) => ({
  subscription: one(subscriptions, { fields: [users.id], references: [subscriptions.userId] }),
  aiConfigs: many(aiConfigs),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  volumes: many(volumes),
  settings: many(settings),
  aiRoles: many(aiRoles),
  memoryEntries: many(memoryEntries),
  storyNarratives: many(storyNarratives),
  editLogs: many(editLogs),
}));

export const volumesRelations = relations(volumes, ({ one, many }) => ({
  project: one(projects, { fields: [volumes.projectId], references: [projects.id] }),
  units: many(units),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  volume: one(volumes, { fields: [units.volumeId], references: [volumes.id] }),
  chapters: many(chapters),
}));

export const chaptersRelations = relations(chapters, ({ one, many }) => ({
  unit: one(units, { fields: [chapters.unitId], references: [units.id] }),
  versions: many(chapterVersions),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  project: one(projects, { fields: [conversations.projectId], references: [projects.id] }),
  messages: many(conversationMessages),
}));

export const conversationMessagesRelations = relations(conversationMessages, ({ one }) => ({
  conversation: one(conversations, { fields: [conversationMessages.conversationId], references: [conversations.id] }),
}));

// ========== 模板广场 ==========

export const templateSourceEnum = pgEnum('template_source', ['official', 'user']);
export const templateAuditEnum = pgEnum('template_audit_status', ['pending', 'approved', 'rejected']);

export const templates = pgTable('templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  source: templateSourceEnum('source').notNull().default('official'),
  category: varchar('category', { length: 100 }), // 方法论/结构/参考章节
  aiTargetRole: varchar('ai_target_role', { length: 50 }), // editor / setting_editor / writer / null
  content: text('content').notNull(),
  preview: text('preview'), // 预览内容
  price: integer('price').default(0), // 价格（分），0=免费
  tipAmount: integer('tip_amount').default(0), // 打赏金额（分）
  uploaderId: uuid('uploader_id').references(() => users.id),
  auditStatus: templateAuditEnum('audit_status').default('pending'),
  reviewReason: text('review_reason'), // 审核意见
  isPublished: boolean('is_published').default(false),
  viewCount: integer('view_count').default(0),
  importCount: integer('import_count').default(0),
  commentsCount: integer('comments_count').default(0),
  likesCount: integer('likes_count').default(0),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const templatePurchases = pgTable('template_purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  templateId: uuid('template_id').notNull().references(() => templates.id),
  pricePaid: integer('price_paid').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const templateRatings = pgTable('template_ratings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  templateId: uuid('template_id').notNull().references(() => templates.id),
  score: integer('score').notNull(), // 1-5
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const templateLikes = pgTable('template_likes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  templateId: uuid('template_id').notNull().references(() => templates.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const contentFingerprints = pgTable('content_fingerprints', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id').notNull().references(() => templates.id).unique(),
  fingerprintHash: varchar('fingerprint_hash', { length: 64 }).notNull(),
  fingerprintDec: bigint('fingerprint_dec', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 免责声明 ==========

export const disclaimers = pgTable('disclaimers', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull().default('模板发布免责声明'),
  content: text('content').notNull(),
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== 用户模板资产 ==========

export const userTemplates = pgTable('user_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  projectId: uuid('project_id').references(() => projects.id),
  templateId: uuid('template_id').references(() => templates.id),
  title: varchar('title', { length: 200 }).notNull(),
  content: text('content').notNull(),
  source: varchar('source', { length: 20 }).default('import'), // import / custom
  category: varchar('category', { length: 100 }), // methodology / structure / style / setting / ai_prompt
  aiTargetRole: varchar('ai_target_role', { length: 50 }), // editor / setting_editor / writer / null
  description: text('description'),
  isFromPurchase: boolean('is_from_purchase').default(false),
  canRepublish: boolean('can_republish').default(true),
  auditStatus: varchar('audit_status', { length: 20 }), // pending / locked / null
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== 签到记录 ==========

export const checkinRecords = pgTable('checkin_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  checkinDate: timestamp('checkin_date').notNull(),
  daysToNextReward: integer('days_to_next_reward').default(0), // 距下次奖励还需签到天数（每10天一轮）
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 邀请记录 ==========

export const referralRecords = pgTable('referral_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  referrerId: uuid('referrer_id').notNull().references(() => users.id),
  referredId: uuid('referred_id').notNull().references(() => users.id),
  rewardDays: integer('reward_days').default(3),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 账单/充值 ==========

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: varchar('type', { length: 20 }).notNull(), // subscribe, referral, checkin, withdraw, bean
  amount: integer('amount').notNull(), // 金额（分），正=收入，负=支出
  description: varchar('description', { length: 200 }),
  status: varchar('status', { length: 20 }).default('pending'), // pending, completed, failed
  beanType: varchar('bean_type', { length: 20 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 模板版本管理 ==========

export const templateVersions = pgTable('template_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userTemplateId: uuid('user_template_id').notNull().references(() => userTemplates.id),
  content: text('content').notNull(),
  versionNumber: integer('version_number').notNull().default(1),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 模板评论 ==========

// 使用延迟引用的方式处理自引用
export const templateComments = pgTable('template_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id').notNull().references(() => templates.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  parentCommentId: uuid('parent_comment_id'), // 延迟添加外键
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== 提现申请 ==========

export const withdrawalRequests = pgTable('withdrawal_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  amount: integer('amount').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending / approved / rejected
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 新表关系定义 ==========

export const templateVersionsRelations = relations(templateVersions, ({ one }) => ({
  userTemplate: one(userTemplates, { fields: [templateVersions.userTemplateId], references: [userTemplates.id] }),
}));

export const templateCommentsRelations = relations(templateComments, ({ one }) => ({
  template: one(templates, { fields: [templateComments.templateId], references: [templates.id] }),
  user: one(users, { fields: [templateComments.userId], references: [users.id] }),
  parent: one(templateComments, { fields: [templateComments.parentCommentId], references: [templateComments.id] }),
}));

export const contentFingerprintsRelations = relations(contentFingerprints, ({ one }) => ({
  template: one(templates, { fields: [contentFingerprints.templateId], references: [templates.id] }),
}));

// ========== 美术资产管理 ==========
// Must be before spriteImages which references it

export const artAssets = pgTable('art_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  // 分类
  category: varchar('category', { length: 30 }).notNull(),   // character / item / effect / ui / animation
  subcategory: varchar('subcategory', { length: 30 }),       // plant/animal/element, idle/upgrade/interact 等
  assetKey: varchar('asset_key', { length: 100 }).notNull(), // 唯一键
  // 描述
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  // 技术规格
  fileFormat: varchar('file_format', { length: 10 }),        // png / svg / json
  width: integer('width'),
  height: integer('height'),
  fileSize: integer('file_size'),
  // 文件位置
  storagePath: text('storage_path').notNull(),
  cdnUrl: text('cdn_url'),
  // 状态
  isPublished: boolean('is_published').default(false),
  isActive: boolean('is_active').default(true),
  // 版本
  version: integer('version').default(1),
  replacedBy: uuid('replaced_by').references((): any => artAssets.id),
  // 审计
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== 精灵系统 ==========

export const spriteCompanionStyleEnum = pgEnum('sprite_companion_style', ['active', 'quiet']);

export const userSprites = pgTable('user_sprites', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id),
  species: varchar('species', { length: 20 }),     // plant / animal / element（孵化后设置）
  variant: varchar('variant', { length: 50 }),     // sunflower / orange-cat / wind（孵化后设置）
  level: integer('level').notNull().default(1),
  customName: varchar('custom_name', { length: 100 }),
  userNickname: varchar('user_nickname', { length: 100 }),
  companionStyle: spriteCompanionStyleEnum('companion_style').default('quiet'),
  totalActiveDays: integer('total_active_days').default(0),
  bonusDays: integer('bonus_days').default(0),
  lastActiveDate: timestamp('last_active_date', { mode: 'date' }),
  positionX: integer('position_x').default(20),
  positionY: integer('position_y').default(80),
  isHatched: boolean('is_hatched').default(false),
  guideStep: integer('guide_step').default(0),
  guideRewardClaimed: boolean('guide_reward_claimed').default(false),
  secretShopFound: boolean('secret_shop_found').default(false),
  beanBalance: integer('bean_balance').default(0),
  totalBeanSpent: integer('total_bean_spent').default(0),
  totalXp: integer('total_xp').default(0),
  convertedDays: integer('converted_days').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const spriteImages = pgTable('sprite_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  species: varchar('species', { length: 20 }).notNull(),
  variant: varchar('variant', { length: 50 }).notNull(),
  level: integer('level').notNull(),
  imageUrl: text('image_url').notNull(),
  promptUsed: text('prompt_used'),
  isActive: boolean('is_active').default(true),
  assetId: uuid('asset_id').references((): any => artAssets.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const spriteItems = pgTable('sprite_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  species: varchar('species', { length: 20 }).notNull(),
  effectMinutes: integer('effect_minutes').notNull(),
  price: integer('price').notNull(),
  icon: varchar('icon', { length: 10 }),
  description: text('description').default(''),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userSpriteItems = pgTable('user_sprite_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  itemCode: varchar('item_code', { length: 50 }).notNull(),
  quantity: integer('quantity').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== 精灵 AI 交互 ==========

export const spriteConversations = pgTable('sprite_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: varchar('role', { length: 20 }).notNull(),       // system / user / assistant
  content: text('content').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const spriteInteractionLog = pgTable('sprite_interaction_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  actionType: varchar('action_type', { length: 30 }).notNull(), // daily_feedback / unit_feedback / volume_feedback / user_chat
  aiUsed: boolean('ai_used').notNull().default(false),
  tokenCount: integer('token_count'),
  fatigueLevel: integer('fatigue_level').notNull().default(0), // 0-100
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 精灵豆体系 ==========

export const spriteBeanTransactions = pgTable('sprite_bean_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: varchar('type', { length: 20 }).notNull(),    // recharge / consume / refund / earn / item_purchase
  amount: integer('amount').notNull(),                 // 正=收入，负=支出
  balanceAfter: integer('balance_after').notNull(),    // 交易后余额
  description: varchar('description', { length: 200 }),
  relatedType: varchar('related_type', { length: 30 }), // order / item / template / interaction
  relatedId: varchar('related_id', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const rechargeOrders = pgTable('recharge_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  amountCents: integer('amount_cents').notNull(),      // 充值金额（分）
  beanAmount: integer('bean_amount').notNull(),        // 获得的精灵豆数量
  paymentMethod: varchar('payment_method', { length: 20 }), // wechat / alipay
  status: varchar('status', { length: 20 }).default('pending'),
  transactionId: varchar('transaction_id', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== Token 中转站系统 ==========

export const apiChannels = pgTable('api_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 50 }).notNull(),
  name: varchar('name', { length: 100 }),
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  baseUrl: varchar('base_url', { length: 500 }),
  priority: integer('priority').default(0),
  maxConcurrency: integer('max_concurrency').default(10),
  weight: integer('weight').default(1),
  status: varchar('status', { length: 20 }).default('active'),
  dailyLimit: bigint('daily_limit', { mode: 'number' }).default(5000000),
  dailyUsed: bigint('daily_used', { mode: 'number' }).default(0),
  dailyResetAt: timestamp('daily_reset_at'),
  userTier: varchar('user_tier', { length: 20 }).default('all'),
  lastErrorAt: timestamp('last_error_at'),
  lastErrorMessage: text('last_error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const modelPricing = pgTable('model_pricing', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 50 }).notNull(),
  modelId: varchar('model_id', { length: 100 }).notNull(),
  modelName: varchar('model_name', { length: 200 }).notNull(),
  groupName: varchar('group_name', { length: 50 }).default('default'),
  inputPricePer1m: bigint('input_price_per_1m', { mode: 'number' }).notNull(),
  outputPricePer1m: bigint('output_price_per_1m', { mode: 'number' }).notNull(),
  currency: varchar('currency', { length: 10 }).default('CNY'),
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userTokenAccounts = pgTable('user_token_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id).unique(),
  balance: bigint('balance', { mode: 'number' }).default(0),
  totalConsumed: bigint('total_consumed', { mode: 'number' }).default(0),
  totalRecharged: bigint('total_recharged', { mode: 'number' }).default(0),
  alertThreshold: bigint('alert_threshold', { mode: 'number' }),
  alertEnabled: boolean('alert_enabled').default(false),
  preferredModel: varchar('preferred_model', { length: 100 }),
  dailyLimit: bigint('daily_limit', { mode: 'number' }).default(10000),
  dailyUsed: bigint('daily_used', { mode: 'number' }).default(0),
  dailyResetAt: timestamp('daily_reset_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const tokenConsumptionLogs = pgTable('token_consumption_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  source: varchar('source', { length: 20 }).notNull(),
  apiKeyId: uuid('api_key_id'),
  provider: varchar('provider', { length: 50 }).notNull(),
  modelId: varchar('model_id', { length: 100 }).notNull(),
  requestType: varchar('request_type', { length: 50 }),
  inputTokens: bigint('input_tokens', { mode: 'number' }).default(0),
  outputTokens: bigint('output_tokens', { mode: 'number' }).default(0),
  cacheHitTokens: bigint('cache_hit_tokens', { mode: 'number' }).default(0),
  cost: bigint('cost', { mode: 'number' }).notNull(),
  requestId: varchar('request_id', { length: 200 }),
  projectId: uuid('project_id'),
  conversationId: uuid('conversation_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userApiKeys = pgTable('user_api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: varchar('name', { length: 100 }).notNull(),
  keyHash: varchar('key_hash', { length: 64 }).notNull().unique(),
  keyPrefix: varchar('key_prefix', { length: 12 }).notNull(),
  status: varchar('status', { length: 20 }).default('active'),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  ipWhitelist: text('ip_whitelist').array(),
  rateLimitPerMin: integer('rate_limit_per_min').default(60),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userSubscriptions = pgTable('user_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  packageId: uuid('package_id'),
  status: varchar('status', { length: 20 }).notNull(),
  startedAt: timestamp('started_at').notNull(),
  expiresAt: timestamp('expires_at'),
  tokenQuotaTotal: bigint('token_quota_total', { mode: 'number' }).notNull(),
  tokenQuotaUsed: bigint('token_quota_used', { mode: 'number' }).default(0),
  autoRenew: boolean('auto_renew').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tokenRechargeOrders = pgTable('token_recharge_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  packageId: uuid('package_id'),
  amountCents: integer('amount_cents').notNull(),
  tokenAmount: bigint('token_amount', { mode: 'number' }).notNull(),
  paymentMethod: varchar('payment_method', { length: 30 }),
  paymentTradeNo: varchar('payment_trade_no', { length: 100 }),
  status: varchar('status', { length: 20 }).default('pending'),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tokenPackages = pgTable('token_packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  priceCents: integer('price_cents').notNull(),
  durationDays: integer('duration_days'),
  tokenQuota: bigint('token_quota', { mode: 'number' }).notNull(),
  modelGroup: varchar('model_group', { length: 50 }).notNull(),
  features: jsonb('features').$type<Record<string, unknown>>().default({}),
  isActive: boolean('is_active').default(true),
  firstPurchasePrice: integer('first_purchase_price'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 管理员操作日志 ==========

export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().references(() => users.id),
  adminLevel: integer('admin_level'),
  action: varchar('action', { length: 50 }).notNull(),
  targetType: varchar('target_type', { length: 30 }),
  targetId: uuid('target_id'),
  details: jsonb('details').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 精灵文本管理系统 ==========

export const spriteTextStatusEnum = pgEnum('sprite_text_status', [
  'draft', 'confirmed', 'published', 'failed',
]);

export const spriteTextTypeEnum = pgEnum('sprite_text_type', [
  'user-trigger', 'idle-phase',
]);

export const spriteAITaskStatusEnum = pgEnum('sprite_ai_task_status', [
  'pending', 'in_progress', 'success', 'failed',
]);

export const spriteAITaskTypeEnum = pgEnum('sprite_ai_task_type', [
  'analyze', 'implement',
]);

export const spriteTextEntries = pgTable('sprite_text_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  species: varchar('species', { length: 20 }).notNull(),
  variant: varchar('variant', { length: 50 }).notNull(),
  level: integer('level').notNull(),            // -1=通用模板, 0-9=具体等级
  textType: spriteTextTypeEnum('text_type').notNull(),
  triggerCondition: text('trigger_condition').notNull(),
  responseText: text('response_text').notNull(),
  status: spriteTextStatusEnum('status').notNull().default('draft'),
  aiTaskId: uuid('ai_task_id'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const spriteAITasks = pgTable('sprite_ai_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  entryId: uuid('entry_id').notNull(),
  species: varchar('species', { length: 20 }).notNull(),
  variant: varchar('variant', { length: 50 }).notNull(),
  level: integer('level').notNull(),
  taskType: spriteAITaskTypeEnum('task_type').notNull(),
  input: text('input').notNull(),
  status: spriteAITaskStatusEnum('status').notNull().default('pending'),
  result: text('result'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// ========== 系统预设 ==========

export const systemPresets = pgTable('system_presets', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: varchar('category', { length: 50 }).notNull(),
  projectType: varchar('project_type', { length: 20 }),
  title: varchar('title', { length: 200 }).notNull(),
  content: text('content').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0),
  isPublished: boolean('is_published').default(false),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== 题材预设 ==========

export const genrePresets = pgTable('genre_presets', {
  id: uuid('id').primaryKey().defaultRandom(),
  genre: genreEnum('genre').notNull(),
  agentRole: varchar('agent_role', { length: 50 }).notNull(),
  projectType: varchar('project_type', { length: 20 }).default('webnovel'),
  systemPrompt: text('system_prompt').notNull(),
  description: text('description'),
  category: varchar('category', { length: 50 }),
  stylePrompt: text('style_prompt'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== 精灵文本系统关系 ==========

export const spriteTextEntriesRelations = relations(spriteTextEntries, ({ one }) => ({
  aiTask: one(spriteAITasks, { fields: [spriteTextEntries.aiTaskId], references: [spriteAITasks.id] }),
}));

export const spriteAITasksRelations = relations(spriteAITasks, ({ one }) => ({
  entry: one(spriteTextEntries, { fields: [spriteAITasks.entryId], references: [spriteTextEntries.id] }),
}));

// ========== 用户反馈 ==========

export const feedbackStatusEnum = pgEnum('feedback_status', ['pending', 'processing', 'resolved', 'closed']);

export const feedbacks = pgTable('feedbacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: varchar('type', { length: 20 }).notNull().default('feedback'), // feedback / bug / suggestion
  title: varchar('title', { length: 200 }).notNull(),
  content: text('content').notNull(),
  screenshot: text('screenshot'), // base64 或 URL
  status: feedbackStatusEnum('status').notNull().default('pending'),
  adminReply: text('admin_reply'),
  repliedAt: timestamp('replied_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== 站内信 ==========

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  title: varchar('title', { length: 200 }).notNull(),
  content: text('content').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  feedbackId: uuid('feedback_id').references(() => feedbacks.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== 密码重置令牌 ==========

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  token: varchar('token', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const feedbacksRelations = relations(feedbacks, ({ one }) => ({
  user: one(users, { fields: [feedbacks.userId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  feedback: one(feedbacks, { fields: [notifications.feedbackId], references: [feedbacks.id] }),
}));

// ========== 章节分析（AI分析持久化） ==========

export const chapterAnalysis = pgTable('chapter_analysis', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  chapterId: uuid('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  jobId: varchar('job_id', { length: 255 }),
  result: text('result'),
  progress: integer('progress').default(0),
  errorMessage: text('error_message'),
  dismissed: boolean('dismissed').notNull().default(false),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 系统全局设置（key-value）
export const systemSettings = pgTable('system_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 用户组配置（动态管理每日限额和模型访问权限）
export const userGroups = pgTable('user_groups', {
  name: varchar('name', { length: 50 }).primaryKey(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  dailyTokenLimit: bigint('daily_token_limit', { mode: 'number' }).default(100000),
  allowedModelGroups: jsonb('allowed_model_groups').default(['default']),
  description: text('description'),
  sortOrder: integer('sort_order').default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== 视频背景 ==========

export const videoBackgrounds = pgTable('video_backgrounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  fileName: text('file_name').notNull(),
  description: text('description'),
  hasAudio: boolean('has_audio').default(true),
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
