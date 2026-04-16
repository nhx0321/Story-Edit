CREATE TABLE subscription_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  plan varchar(50) NOT NULL,          -- monthly_30d, quarterly_90d, yearly_365d
  amount integer NOT NULL,             -- 订单金额（分）
  payment_method varchar(20) NOT NULL, -- wechat, alipay
  status varchar(20) NOT NULL DEFAULT 'pending', -- pending, paid, refunded, partial_refunded
  refund_amount integer NOT NULL DEFAULT 0,      -- 退费金额（分）
  transaction_id varchar(100),         -- 支付通道交易号
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- 插入示例订单数据（用于测试）
INSERT INTO subscription_orders (user_id, plan, amount, payment_method, status, transaction_id, created_at)
SELECT u.id, 'monthly_30d', 2990, 'wechat', 'paid', 'txn_demo_001', NOW() - INTERVAL '30 days'
FROM users u LIMIT 1;
