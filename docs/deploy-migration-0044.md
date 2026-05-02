# 线上部署 — 数据库迁移指南

## 需要执行的迁移

### 0044_video_backgrounds（视频背景表）

对应源文件：[0044_video_backgrounds.sql](apps/server/src/db/migrations/0044_video_backgrounds.sql)

## 执行方式

### 方式一：SSH 登录腾讯云服务器执行

```bash
# 1. SSH 登录服务器
ssh root@<你的服务器IP>

# 2. 进入 PostgreSQL 容器
docker exec -it story-edit-db psql -U story_edit -d story_edit

# 3. 执行建表 SQL
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

# 4. 验证表已创建
\dt video_backgrounds

# 5. 退出
\q
```

### 方式二：腾讯云数据库控制台

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/)
2. 进入 **云数据库 PostgreSQL** 或 **轻量数据库**
3. 找到 story_edit 数据库实例
4. 打开 **SQL 窗口** 或 **DMC 数据管理**
5. 粘贴上面的 `CREATE TABLE` 语句执行

## 验证

建表成功后：

1. 访问线上地址，登录管理员账号
2. 进入 **管理后台 → 背景管理**（侧边栏）
3. 点击「注册新背景」，填写已上传的视频文件名（如 `beach.mp4`）
4. 回到前台，导航栏右侧应出现视频图标，点击切换背景
