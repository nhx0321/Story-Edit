-- 设定交付表：设定编辑完成全部设定后，生成结构化交付文档交付给文学编辑
CREATE TABLE IF NOT EXISTS settings_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  -- 结构化交付内容（JSONB，包含各类目设定条目列表、一致性报告、梗概影响分析）
  content JSONB NOT NULL,
  -- 设定编辑对话ID（关联到产生此交付的对话）
  conversation_id UUID REFERENCES conversations(id),
  -- 创建者
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settings_deliveries_project ON settings_deliveries(project_id);
