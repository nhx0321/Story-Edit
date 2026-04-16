-- 移除 claude/openai provider，保留 longcat/deepseek/qwen/custom

-- 先清理可能使用 claude/openai 的旧配置
DELETE FROM "ai_configs" WHERE "provider" IN ('claude', 'openai');

-- PostgreSQL 不支持直接 DROP VALUE 带 IF EXISTS，需要重建枚举
-- 创建新枚举
CREATE TYPE "ai_provider_new" AS ENUM ('deepseek', 'longcat', 'qwen', 'custom');

-- 更新使用旧枚举的列
ALTER TABLE "ai_configs" ALTER COLUMN "provider" TYPE "ai_provider_new"
  USING "provider"::text::"ai_provider_new";

ALTER TABLE "ai_usage_logs" ALTER COLUMN "provider" TYPE "ai_provider_new"
  USING "provider"::text::"ai_provider_new";

-- 删除旧枚举（先删除所有依赖）
DROP TYPE "ai_provider";

-- 重命名新枚举
ALTER TYPE "ai_provider_new" RENAME TO "ai_provider";
