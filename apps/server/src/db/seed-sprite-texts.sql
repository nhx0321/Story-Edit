-- ============================================================
-- 精灵随机对话文本同步到管理后台-美术资产-精灵文本面板
-- 包含：休息台词、无AI配置台词、普通反馈台词、鼓励文案
-- ============================================================

-- 休息台词 (user-trigger: sleep)
INSERT INTO sprite_text_entries (species, variant, level, text_type, trigger_condition, response_text, status)
VALUES
  ('plant', 'sunflower', -1, 'user-trigger', '休息/睡觉', '呼噜呼噜……zzz', 'draft'),
  ('plant', 'sunflower', -1, 'user-trigger', '休息/睡觉', '精灵说：让我睡一会儿……', 'draft'),
  ('plant', 'sunflower', -1, 'user-trigger', '休息/睡觉', 'zzZ……精灵翻了个身', 'draft'),
  ('plant', 'sunflower', -1, 'user-trigger', '休息/睡觉', '太累了……我要去睡一会儿……', 'draft'),
  ('animal', 'orange-cat', -1, 'user-trigger', '休息/睡觉', '呼噜呼噜……zzz', 'draft'),
  ('animal', 'orange-cat', -1, 'user-trigger', '休息/睡觉', '精灵说：让我睡一会儿……', 'draft'),
  ('animal', 'orange-cat', -1, 'user-trigger', '休息/睡觉', 'zzZ……精灵翻了个身', 'draft'),
  ('animal', 'orange-cat', -1, 'user-trigger', '休息/睡觉', '太累了……我要去睡一会儿……', 'draft'),
  ('element', 'wind', -1, 'user-trigger', '休息/睡觉', '呼噜呼噜……zzz', 'draft'),
  ('element', 'wind', -1, 'user-trigger', '休息/睡觉', '精灵说：让我睡一会儿……', 'draft'),
  ('element', 'wind', -1, 'user-trigger', '休息/睡觉', 'zzZ……精灵翻了个身', 'draft'),
  ('element', 'wind', -1, 'user-trigger', '休息/睡觉', '太累了……我要去睡一会儿……', 'draft')
;

-- 无AI配置台词 (idle-phase: 无AI时随机展示)
INSERT INTO sprite_text_entries (species, variant, level, text_type, trigger_condition, response_text, status)
VALUES
  ('plant', 'sunflower', -1, 'idle-phase', '无AI配置/随机互动', '精灵眨了眨眼，似乎在思考什么……', 'draft'),
  ('plant', 'sunflower', -1, 'idle-phase', '无AI配置/随机互动', '精灵挥了挥手，表示它还在呢～', 'draft'),
  ('plant', 'sunflower', -1, 'idle-phase', '无AI配置/随机互动', '精灵安静地待在你的写作软件里～', 'draft'),
  ('animal', 'orange-cat', -1, 'idle-phase', '无AI配置/随机互动', '精灵眨了眨眼，似乎在思考什么……', 'draft'),
  ('animal', 'orange-cat', -1, 'idle-phase', '无AI配置/随机互动', '精灵挥了挥手，表示它还在呢～', 'draft'),
  ('animal', 'orange-cat', -1, 'idle-phase', '无AI配置/随机互动', '精灵安静地待在你的写作软件里～', 'draft'),
  ('element', 'wind', -1, 'idle-phase', '无AI配置/随机互动', '精灵眨了眨眼，似乎在思考什么……', 'draft'),
  ('element', 'wind', -1, 'idle-phase', '无AI配置/随机互动', '精灵挥了挥手，表示它还在呢～', 'draft'),
  ('element', 'wind', -1, 'idle-phase', '无AI配置/随机互动', '精灵安静地待在你的写作软件里～', 'draft')
;

-- 普通反馈台词 (user-trigger: AI调用失败时的备选)
INSERT INTO sprite_text_entries (species, variant, level, text_type, trigger_condition, response_text, status)
VALUES
  ('plant', 'sunflower', -1, 'user-trigger', 'AI反馈失败/普通互动', '精灵在旁边安静地看着你写作～', 'draft'),
  ('plant', 'sunflower', -1, 'user-trigger', 'AI反馈失败/普通互动', '精灵觉得你的故事很有趣～', 'draft'),
  ('plant', 'sunflower', -1, 'user-trigger', 'AI反馈失败/普通互动', '精灵默默记下了什么……', 'draft'),
  ('plant', 'sunflower', -1, 'user-trigger', 'AI反馈失败/普通互动', '精灵点了点头，似乎很认同～', 'draft'),
  ('animal', 'orange-cat', -1, 'user-trigger', 'AI反馈失败/普通互动', '精灵在旁边安静地看着你写作～', 'draft'),
  ('animal', 'orange-cat', -1, 'user-trigger', 'AI反馈失败/普通互动', '精灵觉得你的故事很有趣～', 'draft'),
  ('animal', 'orange-cat', -1, 'user-trigger', 'AI反馈失败/普通互动', '精灵默默记下了什么……', 'draft'),
  ('animal', 'orange-cat', -1, 'user-trigger', 'AI反馈失败/普通互动', '精灵点了点头，似乎很认同～', 'draft'),
  ('element', 'wind', -1, 'user-trigger', 'AI反馈失败/普通互动', '精灵在旁边安静地看着你写作～', 'draft'),
  ('element', 'wind', -1, 'user-trigger', 'AI反馈失败/普通互动', '精灵觉得你的故事很有趣～', 'draft'),
  ('element', 'wind', -1, 'user-trigger', 'AI反馈失败/普通互动', '精灵默默记下了什么……', 'draft'),
  ('element', 'wind', -1, 'user-trigger', 'AI反馈失败/普通互动', '精灵点了点头，似乎很认同～', 'draft')
;

-- 鼓励文案 (user-trigger: 双击随机互动)
INSERT INTO sprite_text_entries (species, variant, level, text_type, trigger_condition, response_text, status)
VALUES
  ('plant', 'sunflower', -1, 'user-trigger', '双击互动/鼓励', '写作加油！你今天也很棒~', 'draft'),
  ('plant', 'sunflower', -1, 'user-trigger', '双击互动/鼓励', '每一段文字都是进步的阶梯', 'draft'),
  ('plant', 'sunflower', -1, 'user-trigger', '双击互动/鼓励', '坚持写作，你已经在路上了', 'draft'),
  ('plant', 'sunflower', -1, 'user-trigger', '双击互动/鼓励', '灵感来源于每一天的积累', 'draft'),
  ('plant', 'sunflower', -1, 'user-trigger', '双击互动/鼓励', '慢慢来，好作品需要时间打磨', 'draft'),
  ('plant', 'sunflower', -1, 'user-trigger', '双击互动/鼓励', '你的故事值得被讲述', 'draft'),
  ('plant', 'sunflower', -1, 'user-trigger', '双击互动/鼓励', '今天的你比昨天更接近完成', 'draft'),
  ('animal', 'orange-cat', -1, 'user-trigger', '双击互动/鼓励', '写作加油！你今天也很棒~', 'draft'),
  ('animal', 'orange-cat', -1, 'user-trigger', '双击互动/鼓励', '每一段文字都是进步的阶梯', 'draft'),
  ('animal', 'orange-cat', -1, 'user-trigger', '双击互动/鼓励', '坚持写作，你已经在路上了', 'draft'),
  ('animal', 'orange-cat', -1, 'user-trigger', '双击互动/鼓励', '灵感来源于每一天的积累', 'draft'),
  ('animal', 'orange-cat', -1, 'user-trigger', '双击互动/鼓励', '慢慢来，好作品需要时间打磨', 'draft'),
  ('animal', 'orange-cat', -1, 'user-trigger', '双击互动/鼓励', '你的故事值得被讲述', 'draft'),
  ('animal', 'orange-cat', -1, 'user-trigger', '双击互动/鼓励', '今天的你比昨天更接近完成', 'draft'),
  ('element', 'wind', -1, 'user-trigger', '双击互动/鼓励', '写作加油！你今天也很棒~', 'draft'),
  ('element', 'wind', -1, 'user-trigger', '双击互动/鼓励', '每一段文字都是进步的阶梯', 'draft'),
  ('element', 'wind', -1, 'user-trigger', '双击互动/鼓励', '坚持写作，你已经在路上了', 'draft'),
  ('element', 'wind', -1, 'user-trigger', '双击互动/鼓励', '灵感来源于每一天的积累', 'draft'),
  ('element', 'wind', -1, 'user-trigger', '双击互动/鼓励', '慢慢来，好作品需要时间打磨', 'draft'),
  ('element', 'wind', -1, 'user-trigger', '双击互动/鼓励', '你的故事值得被讲述', 'draft'),
  ('element', 'wind', -1, 'user-trigger', '双击互动/鼓励', '今天的你比昨天更接近完成', 'draft')
;
