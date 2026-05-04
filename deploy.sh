#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm 未安装，无法继续部署" >&2
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 未安装，无法继续部署" >&2
  exit 1
fi

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/.env"
  set +a
fi

echo "[1/4] 安装依赖"
pnpm install --frozen-lockfile

echo "[2/4] 构建项目"
pnpm build

echo "[3/4] 重载 PM2 服务"
pm2 startOrReload "$ROOT_DIR/ecosystem.config.cjs" --env production
pm2 save

echo "[4/4] 校验服务状态"
curl --fail --silent --show-error "http://127.0.0.1:${SERVER_PORT:-3001}/health" > /dev/null
curl --fail --silent --show-error "http://127.0.0.1:${WEB_PORT:-3000}" > /dev/null

echo "部署完成。注意：本脚本不会自动执行 pnpm db:migrate，数据库迁移请按已验证流程单独执行。"
