# 2026-05-05 基线快照索引

> 说明：本索引用于串联“版本统一收口”启动时的本地、GitHub、服务器、管理员权限、数据库结构基线。
>
> 原则：只追加，不覆盖旧 baseline 文件。

## 本轮新增基线文件

1. `2026-05-05-local-working-tree.txt`
   - 本地未提交文件清单
   - 当前分支与工作树状态
   - 用于冻结本轮纳入 / 不纳入范围

2. `2026-05-05-github-baseline.txt`
   - 本地 HEAD
   - 远端 `origin/HEAD`
   - 当前分支名
   - 用于确认 GitHub 统一基线位置

3. `2026-05-05-server-runtime-summary.txt`
   - 服务器目录是否为 git 仓库
   - PM2 进程状态
   - `3001/health`、`3000`、`template.list` 状态
   - 背景资源目录在位情况

4. `2026-05-05-admin-regression-baseline.md`
   - 管理员入口 / 菜单 / 页面 / 接口四层回归基线
   - 关键实现文件索引

5. `2026-05-05-db-permission-baseline.txt`
   - 管理员账号权限字段基线
   - `user_token_accounts` / `api_channels` 关键结构基线

## 继续沿用的旧基线
- `git-status-before.txt`
- `git-diff-stat-before.txt`
- `git-diff-before.patch`
- `admin-pages-before.txt`
- `ai-config-pages-before.txt`
- `settings-pages-before.txt`
- `migrations-dir-before.txt`
- `migrations-meta-before.txt`
- `sprites-assets-before.txt`

## 本轮结论摘要
- GitHub 当前已提交基线与本地 HEAD 一致：`7b81d5932bdc4898003309e464b910a346f3f0e5`
- 服务器 `/root/Story-Edit` 当前不是 git 仓库
- 服务器服务可运行，但部署主链仍未恢复为 `git pull + bash deploy.sh`
- 管理员账号数据库状态正常：`is_admin=true`、`admin_level=0`、`null_admin_level_count=0`
- `user_token_accounts`、`api_channels` 本轮 P0 关键列已在线上存在
