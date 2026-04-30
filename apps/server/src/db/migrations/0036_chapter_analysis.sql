-- AI分析持久化：后台任务 + 跨页面恢复
CREATE TABLE IF NOT EXISTS chapter_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,          -- 'self_check' | 'l0_l4_summary' | 'modification'
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | processing | completed | failed
  job_id VARCHAR(255),                 -- Redis job ID for reconnection
  result TEXT,                         -- 完整的分析结果
  progress INTEGER DEFAULT 0,          -- 0-100 进度百分比
  error_message TEXT,                  -- 失败原因
  dismissed BOOLEAN NOT NULL DEFAULT FALSE, -- 用户已阅标记
  metadata JSONB DEFAULT '{}',         -- L0-L4 各 level 状态等额外信息
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chapter_analysis_project ON chapter_analysis(project_id);
CREATE INDEX IF NOT EXISTS idx_chapter_analysis_chapter ON chapter_analysis(chapter_id);
CREATE INDEX IF NOT EXISTS idx_chapter_analysis_user ON chapter_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_chapter_analysis_status ON chapter_analysis(status);
