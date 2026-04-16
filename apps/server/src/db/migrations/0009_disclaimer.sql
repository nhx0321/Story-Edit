CREATE TABLE disclaimers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '模板发布免责声明',
  content text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- 初始免责声明内容
INSERT INTO disclaimers (content, version, is_active) VALUES (
'1. 本人确认所发布的模板内容为原创或本人拥有合法的发布权、使用权。
2. 模板内容不侵犯任何第三方的知识产权、肖像权、隐私权、名誉权或其他合法权益。
3. 模板内容不包含任何违法、色情、暴力、诽谤、欺诈性信息。
4. 模板内容不涉及政治、宗教、历史人物、种族歧视等敏感话题。
5. 模板内容可用于商业用途，但不得用于违法或违背公序良俗的目的。
6. 如因模板内容引发任何纠纷、索赔或法律责任，由发布者承担全部责任，平台不承担任何责任。
7. 平台有权对违规内容进行审核、下架、删除，并保留追究相关责任的权利。
8. 本人已仔细阅读并完全理解上述声明，自愿接受其约束。',
1,
true
);
