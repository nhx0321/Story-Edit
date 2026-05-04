# 2026-05-04 部署修复版本保留与验证清单

## 本轮版本保留范围

仅保留本轮部署修复相关文件：

- `.env.example`
- `.gitignore`
- `apps/web/lib/ai-stream.ts`
- `apps/web/lib/trpc-provider.tsx`
- `apps/web/middleware.ts`
- `apps/web/next.config.js`
- `docs/deploy-migration-0044.md`
- `docs/ssh-login-guide.md` 删除
- `docs/standard-deploy.md`
- `deploy.sh`
- `ecosystem.config.cjs`
- `packages/ai-adapters/package.json`
- `packages/shared/package.json`
- `packages/templates/package.json`
- `packages/ui/package.json`
- `sync-from-server.ps1`
- `桌面精灵/sunflower/*` 删除

## 明确不纳入本轮版本保留

- `apps/web/next-env.d.ts`
- `.turbo/`
- `apps/web/public/backgrounds/`
- `docs/database-backup/`
- `story-edit-v2.zip`
- `story_edit_backup.sql`
- `docs/CHANGELOG.md`

## 当前验证状态

已完成：

- `pnpm build`
- `pnpm --filter @story-edit/server lint`
- `pnpm --filter @story-edit/web test`
- PowerShell 脚本 `sync-from-server.ps1` 编译校验

## 版本保留前最后核对

1. 仅暂存“本轮版本保留范围”中的文件
2. 不把自动生成文件 `apps/web/next-env.d.ts` 纳入
3. 不把图片删除、备份文件、数据库导出文件混入
4. 版本说明聚焦三件事：
   - 云端运行修复永久化
   - 标准部署流程补齐
   - 数据同步/0044 迁移文档修复
5. 如本次变更涉及 `apps/web/public/backgrounds/`，发布时提醒手动上传阿里云服务器对应目录 `/root/Story-Edit/apps/web/public/backgrounds/`，不经 GitHub 中转

## 部署后最小冒烟测试

1. `curl -i http://127.0.0.1:3001/health`
2. `curl -i http://127.0.0.1:3000`
3. `curl -i "http://127.0.0.1:3000/trpc/template.list?batch=1&input=%7B%220%22%3A%7B%22sortBy%22%3A%22newest%22%7D%7D"`
4. 使用开发需求文档中新增的 2 个 longcat 渠道做一次版本变动推送测试

## 需要用户手动操作时机

### 时机 A：准备做版本保留时

用户确认是否要创建 git 提交，只提交本清单列出的保留文件。

### 时机 B：准备做云端冒烟测试时

1. 用户把 longcat 渠道配置补到服务器目标环境或后台配置中
2. 如果本次包含背景资源更新，用户手动上传 `apps/web/public/backgrounds/` 对应视频/图片到阿里云服务器 `/root/Story-Edit/apps/web/public/backgrounds/`
3. 再按最小冒烟测试执行，并根据现有后台逻辑检查背景文件是否正常识别/发布
