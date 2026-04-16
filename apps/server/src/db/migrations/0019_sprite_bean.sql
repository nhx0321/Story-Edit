-- 精灵豆体系迁移
-- 1. 新增精灵豆流水表
CREATE TABLE IF NOT EXISTS sprite_bean_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    type VARCHAR(20) NOT NULL,          -- recharge / consume / refund / earn / item_purchase
    amount INTEGER NOT NULL,             -- 正=收入，负=支出
    balance_after INTEGER NOT NULL,      -- 交易后余额
    description VARCHAR(200),
    related_type VARCHAR(30),            -- order / item / template / interaction
    related_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. 新增充值订单表
CREATE TABLE IF NOT EXISTS recharge_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    amount_cents INTEGER NOT NULL,       -- 充值金额（分）
    bean_amount INTEGER NOT NULL,        -- 获得的精灵豆数量
    payment_method VARCHAR(20),          -- wechat / alipay
    status VARCHAR(20) DEFAULT 'pending',-- pending / paid / cancelled
    transaction_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. sprite_items 新增 refund_rate 字段
ALTER TABLE sprite_items ADD COLUMN IF NOT EXISTS refund_rate DECIMAL(5,2) DEFAULT 0.50;

-- 4. subscriptions 表改为默认 'free' 状态（不再自动设为 trial）
ALTER TABLE subscriptions ALTER COLUMN status SET DEFAULT 'free';

-- 5. transactions 表注释：旧的 subscribe/withdraw 类型不再使用
-- 不删除表，保留历史数据。新增 'bean' 类型用于精灵豆相关交易。
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bean_type VARCHAR(20);

-- 6. user_sprites 的 species 和 variant 改为可空（精灵蛋阶段无系别）
ALTER TABLE user_sprites ALTER COLUMN species DROP NOT NULL;
ALTER TABLE user_sprites ALTER COLUMN variant DROP NOT NULL;
