-- Seed data for token system
INSERT INTO token_packages (name, type, price_cents, duration_days, token_quota, model_group, sort_order)
VALUES
  ('基础月套餐', 'subscription', 990, 30, 10000000000000, 'default', 1),
  ('创作者月套餐', 'subscription', 2990, 30, 50000000000000, 'premium', 2),
  ('专业年套餐', 'subscription', 19900, 365, 120000000000000, 'all', 3),
  ('Token充值包 ¥10', 'prepaid', 1000, NULL, 100000000000, 'default', 4),
  ('Token充值包 ¥50', 'prepaid', 5000, NULL, 600000000000, 'premium', 5),
  ('Token充值包 ¥100', 'prepaid', 10000, NULL, 1300000000000, 'all', 6);

INSERT INTO model_pricing (provider, model_id, model_name, group_name, input_price_per_1m, output_price_per_1m, sort_order)
VALUES
  ('deepseek', 'deepseek-chat', 'DeepSeek Chat', 'default', 1, 2, 1),
  ('deepseek', 'deepseek-reasoner', 'DeepSeek Reasoner', 'premium', 4, 8, 2),
  ('longcat', 'LongCat-Flash-Chat', 'LongCat Flash Chat', 'default', 0, 0, 3),
  ('longcat', 'LongCat-Flash-Thinking-2601', 'LongCat Flash Thinking 2601', 'premium', 0, 0, 4),
  ('qwen', 'qwen-turbo', 'Qwen Turbo', 'default', 2, 4, 5),
  ('qwen', 'qwen-plus', 'Qwen Plus', 'premium', 4, 8, 6);
