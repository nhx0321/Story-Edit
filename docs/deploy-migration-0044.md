# 0044_video_backgrounds 迁移执行说明

## 适用范围

本文档用于修正历史迁移 `0044_video_backgrounds.sql` 的线上执行说明，使其与当前环境保持一致：

- 云服务器：阿里云 ECS
- 应用目录：`/root/Story-Edit`
- 数据库：宿主 PostgreSQL `story_edit`
- 应用进程：PM2 管理的 `story-edit-server` / `story-edit-web`

对应迁移文件：

- `apps/server/src/db/migrations/0044_video_backgrounds.sql`

迁移内容如下：

```sql
CREATE TABLE video_backgrounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  file_name TEXT NOT NULL,
  description TEXT,
  has_audio BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```

## 重要前提

1. 不要沿用旧文档里的“腾讯云 / Docker PostgreSQL 容器”假设
2. 当前线上数据库应按宿主 PostgreSQL 处理，不默认进入 `story-edit-db` 容器
3. 不要把这次迁移混进 `deploy.sh`
4. 不要在未确认迁移链状态前，直接把共享环境发布等同于执行 `pnpm db:migrate`

也就是说：

- 应用发布走 `deploy.sh`
- 数据库迁移单独执行、单独验证

## 执行前检查

先 SSH 到服务器：

```bash
ssh root@39.107.119.182
cd /root/Story-Edit
```

确认数据库连接信息：

```bash
grep -E '^(DATABASE_URL|SERVER_PORT|WEB_PORT)=' .env
```

建议先确认 `video_backgrounds` 是否已经存在，避免重复执行 `CREATE TABLE`：

```bash
PGPASSWORD='story_edit_dev' psql -h 127.0.0.1 -p 5432 -U story_edit -d story_edit -c "\dt public.video_backgrounds"
```

如果结果里已经有 `public.video_backgrounds`，说明 0044 已经落库，不要重复执行下面的建表 SQL。

## 推荐执行方式

### 方式一：直接在宿主 PostgreSQL 执行单次 SQL

适用于：

- 已确认表不存在
- 只需要补这一个历史迁移
- 不希望把整条迁移链一次性推进

执行命令：

```bash
PGPASSWORD='story_edit_dev' psql -h 127.0.0.1 -p 5432 -U story_edit -d story_edit <<'SQL'
CREATE TABLE video_backgrounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  file_name TEXT NOT NULL,
  description TEXT,
  has_audio BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
SQL
```

执行后验证：

```bash
PGPASSWORD='story_edit_dev' psql -h 127.0.0.1 -p 5432 -U story_edit -d story_edit -c "\d+ public.video_backgrounds"
```

## 不推荐的方式

当前阶段，不推荐把下面动作当成默认方案：

```bash
pnpm db:migrate
```

原因不是 0044 本身复杂，而是当前仓库已有迁移链审计文档明确提示：

- 共享环境迁移链需要谨慎处理
- 历史迁移存在需要核对的上下文
- 自动推进整条迁移链的风险高于单表补齐

因此，本次文档只给出 0044 的定点修复方案。

## 应用侧验证

建表完成后，建议按下面顺序验证：

1. 确认后端仍在线

```bash
curl -i http://127.0.0.1:3001/health
```

2. 如刚发布过代码，再确认 PM2 状态

```bash
pm2 describe story-edit-server
pm2 describe story-edit-web
```

3. 登录站点后台，检查：
   - 管理后台 -> 背景管理
   - 能否看到背景管理页面
   - 能否新增视频背景记录

4. 前台验证：
   - 打开页面
   - 检查视频背景是否能正常切换

## 回滚说明

如果只是新建了一张空表，最直接的回滚是：

```bash
PGPASSWORD='story_edit_dev' psql -h 127.0.0.1 -p 5432 -U story_edit -d story_edit -c "DROP TABLE public.video_backgrounds;"
```

但这属于破坏性操作。若表中已经写入真实数据，不应直接执行，应先导出或备份后再处理。

## 当前结论

相较旧版文档，本文件已经做了这些修正：

- 去掉腾讯云表述
- 去掉 Docker PostgreSQL 容器假设
- 明确当前目标是阿里云宿主 PostgreSQL
- 明确 0044 应按“单次定点执行”处理
- 明确不把 `pnpm db:migrate` 当成默认上线步骤
