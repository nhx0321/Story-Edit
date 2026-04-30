-- Token中转站系统数据库迁移
-- Phase 1: 基础设施表

-- 上游API渠道（供应商API Key池）
CREATE TABLE IF NOT EXISTS api_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,              -- openai / anthropic / deepseek / longcat / qwen
  name VARCHAR(100),                           -- 渠道名称（管理用）
  api_key_encrypted TEXT NOT NULL,             -- AES-256-CBC 加密的上游API Key
  base_url VARCHAR(500),                       -- 自定义API地址
  priority INT DEFAULT 0,                      -- 调度优先级（数值越大越优先）
  max_concurrency INT DEFAULT 10,              -- 最大并发数
  weight INT DEFAULT 1,                        -- 负载均衡权重
  status VARCHAR(20) DEFAULT 'active',         -- active / disabled / rate_limited
  daily_limit BIGINT DEFAULT 5000000,          -- 日消耗上限（token数）
  daily_used BIGINT DEFAULT 0,                 -- 今日已消耗token数
  daily_reset_at TIMESTAMP,                    -- 日消耗重置时间
  user_tier VARCHAR(20) DEFAULT 'all',         -- 服务的用户等级: free / vip / all
  last_error_at TIMESTAMP,
  last_error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 模型定价
CREATE TABLE IF NOT EXISTS model_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  model_id VARCHAR(100) NOT NULL,              -- e.g. "deepseek-chat"
  model_name VARCHAR(200) NOT NULL,            -- 展示名称
  group_name VARCHAR(50) DEFAULT 'default',    -- 分组: default / premium
  input_price_per_1m INT NOT NULL,             -- 输入价格（分/百万token）
  output_price_per_1m INT NOT NULL,            -- 输出价格（分/百万token）
  currency VARCHAR(10) DEFAULT 'CNY',
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider, model_id)
);

-- 用户Token账户（内部精度: 1元=10,000,000单位）
CREATE TABLE IF NOT EXISTS user_token_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  balance BIGINT DEFAULT 0,                    -- Token余额（内部单位: 1/10000分）
  total_consumed BIGINT DEFAULT 0,             -- 累计消费
  total_recharged BIGINT DEFAULT 0,            -- 累计充值
  alert_threshold BIGINT,                      -- 额度预警阈值
  alert_enabled BOOLEAN DEFAULT false,         -- 是否开启预警
  daily_limit BIGINT DEFAULT 10000,            -- 每日Token上限（免费用户默认10K）
  daily_used BIGINT DEFAULT 0,                 -- 今日已用
  daily_reset_at TIMESTAMP,                    -- 日用量重置时间
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Token消费记录
CREATE TABLE IF NOT EXISTS token_consumption_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  source VARCHAR(20) NOT NULL,                 -- in_app / external_api
  api_key_id UUID,                             -- 外部API Key ID
  provider VARCHAR(50) NOT NULL,
  model_id VARCHAR(100) NOT NULL,
  request_type VARCHAR(50),                    -- chat / completion / embedding / image
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  cache_hit_tokens INT DEFAULT 0,              -- 缓存命中token数
  cost BIGINT NOT NULL,                        -- 消费额度（平台内部单位）
  request_id VARCHAR(200),                     -- 请求追踪ID
  project_id UUID,                             -- 关联项目（站内使用）
  conversation_id UUID,                        -- 关联对话（站内使用）
  created_at TIMESTAMP DEFAULT NOW()
);

-- 用户API Key（站外调用）
CREATE TABLE IF NOT EXISTS user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(100) NOT NULL,                  -- Key名称（用户自定义）
  key_hash VARCHAR(64) NOT NULL UNIQUE,        -- SHA-256哈希
  key_prefix VARCHAR(12) NOT NULL,             -- 前12位明文（展示用）
  status VARCHAR(20) DEFAULT 'active',         -- active / revoked
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  ip_whitelist TEXT[],                         -- IP白名单
  rate_limit_per_min INT DEFAULT 60,           -- 每分钟请求限制
  created_at TIMESTAMP DEFAULT NOW()
);

-- 用户订阅（Token套餐订阅）
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  package_id UUID,                             -- 购买的套餐ID
  status VARCHAR(20) NOT NULL,                 -- active / expired / cancelled
  started_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,
  token_quota_total BIGINT NOT NULL,           -- 本周期总Token额度
  token_quota_used BIGINT DEFAULT 0,           -- 本周期已用Token
  auto_renew BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 充值订单（Token充值）
CREATE TABLE IF NOT EXISTS token_recharge_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  package_id UUID,                             -- 购买的套餐ID
  amount_cents INT NOT NULL,                   -- 金额（分）
  token_amount BIGINT NOT NULL,                -- Token数量（内部单位）
  payment_method VARCHAR(30),                  -- wechat / alipay / stripe / manual
  payment_trade_no VARCHAR(100),               -- 第三方支付交易号
  status VARCHAR(20) DEFAULT 'pending',        -- pending / paid / cancelled / refunded
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Token套餐定义
CREATE TABLE IF NOT EXISTS token_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,                  -- e.g. "月度VIP套餐"
  type VARCHAR(20) NOT NULL,                   -- subscription / prepaid / team
  price_cents INT NOT NULL,                    -- 价格（分）
  duration_days INT,                           -- 订阅天数（subscription类型）
  token_quota BIGINT NOT NULL,                 -- 赠送Token额度（内部单位）
  model_group VARCHAR(50) NOT NULL,            -- 适用模型组: default / premium / all
  features JSONB DEFAULT '{}',                 -- 功能权限
  is_active BOOLEAN DEFAULT true,
  first_purchase_price INT,                    -- 首次购买价格（分，可为null）
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- conversations 表增加 model_id 字段（模型锁定）
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS model_id VARCHAR(100);

-- 索引
CREATE INDEX IF NOT EXISTS idx_token_consumption_user_id ON token_consumption_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_token_consumption_created_at ON token_consumption_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_key_hash ON user_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_channels_status ON api_channels(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
