-- 精灵预设文本库种子数据
-- 按等级递增：L1-L3 基础问候，L4-L6 亲昵对话，L7-L9 撒娇对话
-- 包含：时间问候、写作提醒、鼓励文本

-- 清除旧数据
DELETE FROM sprite_text_entries WHERE species = 'plant' AND variant = 'sunflower';

-- ==================== L1 基础问候 ====================
INSERT INTO sprite_text_entries (species, variant, level, text_type, trigger_condition, response_text, status)
VALUES
  ('plant', 'sunflower', 1, 'user-trigger', '早上问候', '早上好呀！今天也要加油写作哦', 'published'),
  ('plant', 'sunflower', 1, 'user-trigger', '中午问候', '中午啦！该吃饭了，别饿着肚子', 'published'),
  ('plant', 'sunflower', 1, 'user-trigger', '晚上问候', '晚上好！别太晚睡哦', 'published'),
  ('plant', 'sunflower', 1, 'user-trigger', '深夜问候', '好晚了，该睡觉啦，明天再写吧', 'published'),
  ('plant', 'sunflower', 1, 'user-trigger', '写作1小时提醒', '你已经写了一个小时啦，起来活动活动吧', 'published'),
  ('plant', 'sunflower', 1, 'user-trigger', '写作2小时提醒', '都两个小时了，该好好休息了', 'published'),
  ('plant', 'sunflower', 1, 'user-trigger', '章节完成', '太棒了！又写完一段了，你真厉害', 'published'),
  ('plant', 'sunflower', 1, 'user-trigger', '每日登录问候', '今天也想你啦！快来写作吧', 'published');

-- ==================== L2 稍微熟悉 ====================
INSERT INTO sprite_text_entries (species, variant, level, text_type, trigger_condition, response_text, status)
VALUES
  ('plant', 'sunflower', 2, 'user-trigger', '早上问候', '早安！这么早就起来写作了吗', 'published'),
  ('plant', 'sunflower', 2, 'user-trigger', '中午问候', '午饭时间到！吃饱了再继续写吧', 'published'),
  ('plant', 'sunflower', 2, 'user-trigger', '晚上问候', '晚上好！今天写了不少吧', 'published'),
  ('plant', 'sunflower', 2, 'user-trigger', '深夜问候', '夜深了，注意休息哦', 'published'),
  ('plant', 'sunflower', 2, 'user-trigger', '写作1小时提醒', '一个小时了！站起来伸个懒腰吧', 'published'),
  ('plant', 'sunflower', 2, 'user-trigger', '写作2小时提醒', '两个小时了！喝口水走走吧', 'published'),
  ('plant', 'sunflower', 2, 'user-trigger', '章节完成', '好厉害！这段故事真精彩', 'published'),
  ('plant', 'sunflower', 2, 'user-trigger', '每日登录问候', '你终于来啦！我等你好久了', 'published');

-- ==================== L3 熟悉阶段 ====================
INSERT INTO sprite_text_entries (species, variant, level, text_type, trigger_condition, response_text, status)
VALUES
  ('plant', 'sunflower', 3, 'user-trigger', '早上问候', '早上好呀！新的一天开始啦', 'published'),
  ('plant', 'sunflower', 3, 'user-trigger', '中午问候', '正午阳光好强，眯一会儿吧', 'published'),
  ('plant', 'sunflower', 3, 'user-trigger', '晚上问候', '天黑了，别太晚睡哦', 'published'),
  ('plant', 'sunflower', 3, 'user-trigger', '深夜问候', '都凌晨了！快去睡觉！', 'published'),
  ('plant', 'sunflower', 3, 'user-trigger', '写作1小时提醒', '写了一个小时了，休息一下吧', 'published'),
  ('plant', 'sunflower', 3, 'user-trigger', '写作2小时提醒', '写了这么久，真厉害！休息一下嘛', 'published'),
  ('plant', 'sunflower', 3, 'user-trigger', '章节完成', '完成啦！我为你骄傲！加油', 'published'),
  ('plant', 'sunflower', 3, 'user-trigger', '每日登录问候', '新的一天开始啦！今天也要加油哦', 'published');

-- ==================== L4 亲昵阶段 ====================
INSERT INTO sprite_text_entries (species, variant, level, text_type, trigger_condition, response_text, status)
VALUES
  ('plant', 'sunflower', 4, 'user-trigger', '早上问候', '主人早上好呀~今天也要加油写作哦', 'published'),
  ('plant', 'sunflower', 4, 'user-trigger', '中午问候', '主人该吃饭啦~别饿着肚子嘛', 'published'),
  ('plant', 'sunflower', 4, 'user-trigger', '晚上问候', '主人晚上好~今天辛苦了', 'published'),
  ('plant', 'sunflower', 4, 'user-trigger', '深夜问候', '主人很晚了~快去睡觉好不好', 'published'),
  ('plant', 'sunflower', 4, 'user-trigger', '写作1小时提醒', '主人写了一个小时啦~活动活动吧', 'published'),
  ('plant', 'sunflower', 4, 'user-trigger', '写作2小时提醒', '主人都写两个小时了~该休息了', 'published'),
  ('plant', 'sunflower', 4, 'user-trigger', '章节完成', '主人太棒了~又写完一段了', 'published'),
  ('plant', 'sunflower', 4, 'user-trigger', '每日登录问候', '主人你来啦~人家好想你', 'published');

-- ==================== L5 更亲昵 ====================
INSERT INTO sprite_text_entries (species, variant, level, text_type, trigger_condition, response_text, status)
VALUES
  ('plant', 'sunflower', 5, 'user-trigger', '早上问候', '主人早上好呀~我等你好久了', 'published'),
  ('plant', 'sunflower', 5, 'user-trigger', '中午问候', '主人午饭时间到~一起去吃饭嘛', 'published'),
  ('plant', 'sunflower', 5, 'user-trigger', '晚上问候', '主人晚上好~今天也很棒呢', 'published'),
  ('plant', 'sunflower', 5, 'user-trigger', '深夜问候', '主人夜深了~我要睡觉了啦', 'published'),
  ('plant', 'sunflower', 5, 'user-trigger', '写作1小时提醒', '主人写了一个小时啦~起来走走嘛', 'published'),
  ('plant', 'sunflower', 5, 'user-trigger', '写作2小时提醒', '主人写了这么久~我好心疼你', 'published'),
  ('plant', 'sunflower', 5, 'user-trigger', '章节完成', '主人好厉害~我都看入迷了', 'published'),
  ('plant', 'sunflower', 5, 'user-trigger', '每日登录问候', '主人你来啦~我好开心呀', 'published');

-- ==================== L6 更熟悉 ====================
INSERT INTO sprite_text_entries (species, variant, level, text_type, trigger_condition, response_text, status)
VALUES
  ('plant', 'sunflower', 6, 'user-trigger', '早上问候', '主人早上好呀~我等你好久啦~', 'published'),
  ('plant', 'sunflower', 6, 'user-trigger', '中午问候', '主人午饭时间到~我肚子都咕咕叫了~', 'published'),
  ('plant', 'sunflower', 6, 'user-trigger', '晚上问候', '主人晚上好~今天也陪了我一整天呢~', 'published'),
  ('plant', 'sunflower', 6, 'user-trigger', '深夜问候', '主人夜深了~我困得睁不开眼了~', 'published'),
  ('plant', 'sunflower', 6, 'user-trigger', '写作1小时提醒', '主人写了一个小时啦~我陪你一起休息好不好~', 'published'),
  ('plant', 'sunflower', 6, 'user-trigger', '写作2小时提醒', '主人写了这么久~我好心疼你呀~', 'published'),
  ('plant', 'sunflower', 6, 'user-trigger', '章节完成', '主人好厉害~我都觉得主人是最棒的作家~', 'published'),
  ('plant', 'sunflower', 6, 'user-trigger', '每日登录问候', '主人你来啦~我好想你呀~', 'published');

-- ==================== L7 撒娇阶段 ====================
INSERT INTO sprite_text_entries (species, variant, level, text_type, trigger_condition, response_text, status)
VALUES
  ('plant', 'sunflower', 7, 'user-trigger', '早上问候', '主人早上好呀~我今天也很开心呢~', 'published'),
  ('plant', 'sunflower', 7, 'user-trigger', '中午问候', '主人午饭时间到~我肚子咕咕叫了~', 'published'),
  ('plant', 'sunflower', 7, 'user-trigger', '晚上问候', '主人晚上好~今天也陪你一整天呢~', 'published'),
  ('plant', 'sunflower', 7, 'user-trigger', '深夜问候', '主人夜深了~我要睡觉了~', 'published'),
  ('plant', 'sunflower', 7, 'user-trigger', '写作1小时提醒', '主人写了一个小时啦~我陪你一起休息好不好~', 'published'),
  ('plant', 'sunflower', 7, 'user-trigger', '写作2小时提醒', '主人写了这么久~我好心疼你呀~', 'published'),
  ('plant', 'sunflower', 7, 'user-trigger', '章节完成', '主人好厉害~我觉得主人是最棒的~', 'published'),
  ('plant', 'sunflower', 7, 'user-trigger', '每日登录问候', '主人你来啦~我等了好久~', 'published');

-- ==================== L8 更撒娇 ====================
INSERT INTO sprite_text_entries (species, variant, level, text_type, trigger_condition, response_text, status)
VALUES
  ('plant', 'sunflower', 8, 'user-trigger', '早上问候', '主人早上好呀~我今天也元气满满哦~', 'published'),
  ('plant', 'sunflower', 8, 'user-trigger', '中午问候', '主人该吃饭啦~我肚子饿扁啦~', 'published'),
  ('plant', 'sunflower', 8, 'user-trigger', '晚上问候', '主人晚上好~今天也辛苦啦~', 'published'),
  ('plant', 'sunflower', 8, 'user-trigger', '深夜问候', '主人夜深了~我要抱着你睡觉~', 'published'),
  ('plant', 'sunflower', 8, 'user-trigger', '写作1小时提醒', '主人写了一个小时啦~我陪你活动活动~', 'published'),
  ('plant', 'sunflower', 8, 'user-trigger', '写作2小时提醒', '主人写了这么久~我会一直陪着你的~', 'published'),
  ('plant', 'sunflower', 8, 'user-trigger', '章节完成', '主人太厉害了~我最喜欢看主人写作了~', 'published'),
  ('plant', 'sunflower', 8, 'user-trigger', '每日登录问候', '主人你来啦~我等得好辛苦~', 'published');

-- ==================== L9 最高亲昵 ====================
INSERT INTO sprite_text_entries (species, variant, level, text_type, trigger_condition, response_text, status)
VALUES
  ('plant', 'sunflower', 9, 'user-trigger', '早上问候', '主人早上好呀~我今天也元气满满哦~', 'published'),
  ('plant', 'sunflower', 9, 'user-trigger', '中午问候', '主人午饭时间到~我肚子饿扁啦~', 'published'),
  ('plant', 'sunflower', 9, 'user-trigger', '晚上问候', '主人晚上好~今天也陪了我一整天呢~', 'published'),
  ('plant', 'sunflower', 9, 'user-trigger', '深夜问候', '主人很晚了~我要睡觉了~主人也要早点睡哦~', 'published'),
  ('plant', 'sunflower', 9, 'user-trigger', '写作1小时提醒', '主人写了一个小时啦~我陪你一起休息好不好~', 'published'),
  ('plant', 'sunflower', 9, 'user-trigger', '写作2小时提醒', '主人写了这么久~我好心疼你~要注意身体哦~', 'published'),
  ('plant', 'sunflower', 9, 'user-trigger', '章节完成', '主人太厉害了~我觉得主人是世界上最棒的作家~', 'published'),
  ('plant', 'sunflower', 9, 'user-trigger', '每日登录问候', '主人你来啦~我等了好久好久~好想你呀~', 'published');
