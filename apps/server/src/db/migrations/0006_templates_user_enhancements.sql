-- Phase 5 & 4: User system enhancements + Template marketplace

-- ===== 用户表扩展 =====
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invite_code" varchar(20);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referred_by_code" varchar(20);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_days_earned" integer DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_checkin_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "checkin_streak" integer DEFAULT 0;

-- ===== 模板广场 =====
CREATE TYPE "template_source" AS ENUM ('official', 'user');
CREATE TYPE "template_audit_status" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE IF NOT EXISTS "templates" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(200) NOT NULL,
  description text,
  source "template_source" NOT NULL DEFAULT 'official',
  category varchar(100),
  content text NOT NULL,
  preview text,
  price integer DEFAULT 0,
  tip_amount integer DEFAULT 0,
  uploader_id uuid REFERENCES "users"(id),
  audit_status "template_audit_status" DEFAULT 'pending',
  view_count integer DEFAULT 0,
  import_count integer DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "template_purchases" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "users"(id),
  template_id uuid NOT NULL REFERENCES "templates"(id),
  price_paid integer DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "template_ratings" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "users"(id),
  template_id uuid NOT NULL REFERENCES "templates"(id),
  score integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "template_likes" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "users"(id),
  template_id uuid NOT NULL REFERENCES "templates"(id),
  created_at timestamp NOT NULL DEFAULT now()
);

-- ===== 用户模板资产 =====
CREATE TABLE IF NOT EXISTS "user_templates" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "users"(id),
  project_id uuid REFERENCES "projects"(id),
  template_id uuid REFERENCES "templates"(id),
  title varchar(200) NOT NULL,
  content text NOT NULL,
  source varchar(20) DEFAULT 'import',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- ===== 签到记录 =====
CREATE TABLE IF NOT EXISTS "checkin_records" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "users"(id),
  checkin_date timestamp NOT NULL,
  days_to_next_reward integer DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ===== 邀请记录 =====
CREATE TABLE IF NOT EXISTS "referral_records" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES "users"(id),
  referred_id uuid NOT NULL REFERENCES "users"(id),
  reward_days integer DEFAULT 3,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ===== 账单/充值 =====
CREATE TABLE IF NOT EXISTS "transactions" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "users"(id),
  type varchar(20) NOT NULL,
  amount integer NOT NULL,
  description varchar(200),
  status varchar(20) DEFAULT 'pending',
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ===== 索引 =====
CREATE INDEX IF NOT EXISTS "idx_templates_source_audit" ON "templates" ("source", "audit_status");
CREATE INDEX IF NOT EXISTS "idx_templates_category" ON "templates" ("category");
CREATE INDEX IF NOT EXISTS "idx_template_purchases_user" ON "template_purchases" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_template_ratings_template" ON "template_ratings" ("template_id");
CREATE INDEX IF NOT EXISTS "idx_template_likes_template" ON "template_likes" ("template_id");
CREATE INDEX IF NOT EXISTS "idx_user_templates_user" ON "user_templates" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_templates_project" ON "user_templates" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_checkin_records_user_date" ON "checkin_records" ("user_id", "checkin_date");
CREATE INDEX IF NOT EXISTS "idx_referral_records_referrer" ON "referral_records" ("referrer_id");
CREATE INDEX IF NOT EXISTS "idx_referral_records_referred" ON "referral_records" ("referred_id");
CREATE INDEX IF NOT EXISTS "idx_transactions_user" ON "transactions" ("user_id");

-- ===== 初始化官方免费模板 =====
INSERT INTO "templates" (title, description, source, category, content, preview, audit_status, view_count, import_count) VALUES
('网文开篇模板', '经典网文开篇结构：主角登场→冲突引入→金手指觉醒', 'official', '结构',
 '【开篇三要素】\n1. 主角身份快速建立\n2. 核心冲突/危机出现\n3. 特殊能力/机遇暗示\n\n【节奏建议】\n前500字：快速切入场景\n500-1500字：展现主角性格和处境\n1500-3000字：冲突升级，悬念留下',
 '【开篇三要素】\n1. 主角身份快速建立\n2. 核心冲突/危机出现\n3. 特殊能力/机遇暗示',
 'approved', 0, 0),

('战斗场景模板', '战斗描写结构：对峙→交手→转折→决胜', 'official', '结构',
 '【战斗四段式】\n1. 对峙阶段：气势、环境、心理\n2. 交手阶段：招式、力量碰撞\n3. 转折阶段：意外、底牌\n4. 决胜阶段：终局、aftermath',
 '【战斗四段式】\n1. 对峙阶段：气势、环境、心理\n2. 交手阶段：招式、力量碰撞\n3. 转折阶段：意外、底牌\n4. 决胜阶段：终局',
 'approved', 0, 0),

('情感场景模板', '感情线描写结构：触发→回忆→情感递进→落点', 'official', '结构',
 '【情感递进结构】\n1. 触发事件：场景或对话引起情感波动\n2. 回忆/联想：过往经历的闪回\n3. 情感递进：内心独白深化\n4. 落点：情感释放或压抑',
 '【情感递进结构】\n1. 触发事件\n2. 回忆/联想\n3. 情感递进\n4. 落点',
 'approved', 0, 0),

('日常过渡模板', '日常过渡写法：轻松节奏、信息补充、伏笔埋设', 'official', '结构',
 '【日常过渡要点】\n1. 承接上文的自然过渡\n2. 轻松愉快的氛围调节\n3. 新信息的自然引入\n4. 伏笔的巧妙埋设',
 '【日常过渡要点】\n1. 承接上文\n2. 氛围调节\n3. 新信息引入\n4. 伏笔埋设',
 'approved', 0, 0),

('末日升级流写作方法论', '末日升级流网文的核心写作技巧和经验总结', 'official', '方法论',
 '【核心要素】\n1. 明确的升级体系\n2. 持续的危机感\n3. 资源稀缺性\n4. 人性考验\n\n【写作节奏】\n- 每3-5章一个小高潮\n- 每10-15章一个中高潮\n- 每30-50章一个大高潮\n\n【爽点设计】\n- 碾压：实力碾压对手\n- 收获：获得珍贵资源\n- 突破：等级/能力突破\n- 认可：获得强者认可',
 '【核心要素】升级体系、危机感、资源稀缺、人性考验\n【节奏】3-5章小高潮，10-15章中高潮，30-50章大高潮',
 'approved', 0, 0),

('三幕剧结构参考', '经典三幕剧结构模板，适用于各种类型小说', 'official', '结构',
 '【第一幕：setup（25%）】\n- 引入主角和世界观\n- 触发事件\n- 主角做出决定\n\n【第二幕：confrontation（50%）】\n- 上升行动\n- 中点转折\n- 最低点\n\n【第三幕：resolution（25%）】\n- 高潮\n- 结局\n- 新的常态',
 '【第一幕 25%】引入→触发事件→决定\n【第二幕 50%】上升→转折→最低点\n【第三幕 25%】高潮→结局→新常态',
 'approved', 0, 0);
