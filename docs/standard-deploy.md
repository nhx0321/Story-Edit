# 标准部署说明

## 当前结论

本项目现在已经补齐了可复用的部署入口，目标是恢复稳定的：

- 本地开发
- 本地构建验证
- GitHub 同步
- 云服务器拉取/覆盖后标准启动

本次已落地的关键文件：

- `deploy.sh`
- `ecosystem.config.cjs`
- `.env.example`

## 必须遵守的部署原则

1. 后端必须以编译产物启动
   - 使用 `apps/server/dist/index.mjs`
   - 不能再用 `tsx src/index.ts` 做生产启动

2. workspace 包必须走 `dist` 入口
   - `packages/ai-adapters/package.json`
   - `packages/shared/package.json`
   - `packages/ui/package.json`
   - `packages/templates/package.json`

3. 不要在部署脚本里直接执行不存在的命令
   - 禁止使用 `pnpm db:push`

4. 不要把数据库迁移和应用重启混成一个黑盒步骤
   - `deploy.sh` 不自动执行 `pnpm db:migrate`
   - 数据库迁移必须单独确认后执行

5. PM2 进程名必须固定
   - `story-edit-server`
   - `story-edit-web`

## 环境变量要求

至少需要在服务器 `.env` 中确认这些值：

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
AI_KEY_ENCRYPTION_SECRET=...
SERVER_PORT=3001
WEB_PORT=3000
SERVER_URL=http://127.0.0.1:3001
NEXT_PUBLIC_API_URL=http://127.0.0.1:3001
NEXT_PUBLIC_BACKEND_URL=http://<你的公网域名或IP>:3001
```

说明：

- `SERVER_URL` / `NEXT_PUBLIC_API_URL`：给 Next 代理和 SSR 用，服务器内网访问后端
- `NEXT_PUBLIC_BACKEND_URL`：给浏览器直连流式接口用，生产环境必须是浏览器可访问地址

## 标准部署步骤

### 1. 上传或同步代码

优先使用 git 工作流；如果云端当前不是 git 仓库，则先用压缩包/同步工具覆盖代码，再进入项目目录。

### 2. 安装依赖并构建

```bash
cd /root/Story-Edit
pnpm install --frozen-lockfile
pnpm build
```

### 3. 用 PM2 标准启动

```bash
cd /root/Story-Edit
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save
```

### 4. 验证服务

```bash
curl -i http://127.0.0.1:3001/health
curl -i http://127.0.0.1:3000
curl -i "http://127.0.0.1:3000/trpc/template.list?batch=1&input=%7B%220%22%3A%7B%22sortBy%22%3A%22newest%22%7D%7D"
```

## 一键部署脚本

仓库根目录已有：

```bash
bash deploy.sh
```

脚本行为：

1. 读取 `.env`
2. `pnpm install --frozen-lockfile`
3. `pnpm build`
4. `pm2 startOrReload ecosystem.config.cjs --env production`
5. 校验 `3001 health` 和 `3000 首页`

## 数据库迁移注意事项

数据库迁移仍然需要谨慎执行。

已有文档已经明确提示：

- 不适合把共享环境迁移直接塞进自动部署
- 不要默认在每次发布时自动跑 `pnpm db:migrate`

因此当前建议：

- 应用发布：走 `deploy.sh`
- 数据库迁移：按单独迁移文档和单次确认执行

已整理的迁移文档入口：

- `docs/deploy-migration-0044.md` — `0044_video_backgrounds` 的定点执行说明，适用于阿里云宿主 PostgreSQL，不默认走 `pnpm db:migrate`

## 当前遗留项

1. 云服务器目录如果要恢复成真正的 git 仓库，还需要单独整理一次
2. Next 16 对 `middleware` 提示未来迁移到 `proxy`，当前不影响运行
3. `sync-from-server.ps1` 已修复，可用于从云服务器导出核心表 SQL 并下载到本地；默认不自动导入，避免误覆盖
