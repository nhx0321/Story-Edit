# 后端部署指南（Ubuntu 22.04 + Docker）

本文档用于把 Story Edit 的后端服务部署到云服务器，并让前端（Vercel / 腾讯云静态部署）能够正常调用 API。

适用场景：
- 服务器系统：**Ubuntu 22.04 64位**
- 代码仓库：`https://github.com/nhx0321/Story-Edit`
- 前端已部署，但**后端尚未部署**

---

## 第 0 步：准备信息

你需要准备：

- 服务器公网 IP
- GitHub 仓库地址
- Vercel 项目控制台访问权限

如果你还没开放安全组端口，先做第 1 步。

---

## 第 1 步：开放服务器端口

### 阿里云

1. 打开 [阿里云 ECS 控制台](https://ecs.console.aliyun.com/)
2. 进入 **实例**，点击你的服务器
3. 进入 **安全组** → **配置规则**
4. 在 **入方向** 添加以下规则：

| 端口 | 协议 | 授权对象 | 用途 |
|------|------|----------|------|
| 22 | TCP | 0.0.0.0/0 | SSH 登录 |
| 3001 | TCP | 0.0.0.0/0 | 后端 API |

> 不建议对公网开放 5432，数据库只在 Docker 内部使用即可。

---

## 第 2 步：SSH 登录服务器

如果你已经登录到 Ubuntu 服务器，可以跳过这一步。

### 方式一：阿里云网页终端

1. 在 ECS 实例页面点击 **远程连接**
2. 选择 **Workbench 远程连接**
3. 用户名输入 `root`
4. 输入你设置的密码

### 方式二：本机终端

```bash
ssh root@你的服务器公网IP
```

首次连接输入 `yes`。

---

## 第 3 步：安装 Docker

在服务器终端执行以下命令：

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

### 验证是否安装成功

```bash
docker --version
docker compose version
```

如果都能输出版本号，就继续下一步。

---

## 第 4 步：拉取项目代码

执行：

```bash
git clone https://github.com/nhx0321/Story-Edit.git
cd Story-Edit/工具开发/项目/story-edit
```

### 验证代码目录

执行：

```bash
ls
```

你应该能看到这些文件：
- `docker-compose.yml`
- `apps/`
- `packages/`
- `package.json`

---

## 第 5 步：启动数据库、Redis、后端

执行：

```bash
docker compose up -d postgres redis server
```

### 查看容器状态

执行：

```bash
docker compose ps
```

正常情况下应该能看到：
- `story-edit-db`
- `story-edit-redis`
- `story-edit-server`

状态应为 `Up`。

---

## 第 6 步：执行数据库迁移

### 先执行本次视频背景建表

执行：

```bash
docker exec -i story-edit-db psql -U story_edit -d story_edit < apps/server/src/db/migrations/0044_video_backgrounds.sql
```

如果成功，通常不会报错，或者会看到 `CREATE TABLE`。

### 验证表是否存在

执行：

```bash
docker exec -it story-edit-db psql -U story_edit -d story_edit
```

进入 PostgreSQL 后执行：

```sql
\dt video_backgrounds
```

看到表名后，执行：

```sql
\q
```

---

## 第 7 步：检查后端是否可访问

在服务器终端执行：

```bash
curl http://127.0.0.1:3001/trpc/health
```

如果返回 JSON 或有内容，说明后端已启动。

然后在你自己的电脑浏览器里访问：

```text
http://你的服务器公网IP:3001/trpc/health
```

如果浏览器能打开，说明公网 API 通了。

---

## 第 8 步：配置前端调用后端 API

如果你的前端部署在 Vercel，需要修改环境变量。

### Vercel 设置步骤

1. 打开 [Vercel 控制台](https://vercel.com/dashboard)
2. 进入你的项目
3. 打开 **Settings**
4. 打开 **Environment Variables**
5. 新增变量：

| 变量名 | 值 |
|--------|----|
| `NEXT_PUBLIC_API_URL` | `http://你的服务器公网IP:3001` |

6. 保存后，进入 **Deployments**
7. 对当前项目执行 **Redeploy**

---

## 第 9 步：验证登录功能

前端重新部署完成后：

1. 打开你的线上前端地址
2. 进入登录页
3. 尝试登录

如果之前的问题已经修复：
- 不会再出现 `trpc/auth.login 404`
- 不会再出现 `Unexpected token '<'`

---

## 第 10 步：验证视频背景功能

你之前已经把视频文件上传到 GitHub 对应目录，镜像构建后会自动带上这些静态资源。

接下来：

1. 登录管理员账号
2. 进入 **管理后台 → 背景管理**
3. 注册视频文件，例如：
   - `beach.mp4`
   - `snow.mp4`
   - `water.mp4`
   - `Wheat field.mp4`
4. 保存后回到前台
5. 点击导航栏右侧的视频按钮切换背景
6. 测试喇叭按钮静音/取消静音

---

## 常用排查命令

### 查看容器状态

```bash
docker compose ps
```

### 查看后端日志

```bash
docker compose logs -f server
```

### 查看数据库日志

```bash
docker compose logs -f postgres
```

### 重启后端

```bash
docker compose restart server
```

### 重新拉代码并重建后端

```bash
cd ~/Story-Edit/工具开发/项目/story-edit
git pull
docker compose build --no-cache server
docker compose up -d server
```

### 如果前端静态资源也要重新构建

```bash
cd ~/Story-Edit/工具开发/项目/story-edit
git pull
docker compose build --no-cache web server
docker compose up -d web server
```

---

## 关键文件跳转

- [docker-compose.yml](../docker-compose.yml)
- [apps/server/Dockerfile](../apps/server/Dockerfile)
- [apps/web/Dockerfile](../apps/web/Dockerfile)
- [0044_video_backgrounds.sql](../apps/server/src/db/migrations/0044_video_backgrounds.sql)
- [middleware.ts](../apps/web/middleware.ts)

---

## 推荐你现在一步步执行

按下面顺序操作，不要跳步：

1. 开放阿里云安全组 3001 端口
2. 在 Ubuntu 服务器执行 Docker 安装命令
3. `git clone` 仓库
4. `cd Story-Edit/工具开发/项目/story-edit`
5. `docker compose up -d postgres redis server`
6. 执行 `0044_video_backgrounds.sql`
7. 浏览器访问 `http://你的公网IP:3001/trpc/health`
8. 去 Vercel 设置 `NEXT_PUBLIC_API_URL`
9. Vercel 重新部署
10. 测试登录
11. 测试背景切换

如果某一步报错，把那一步的完整输出发给我，我继续带你往下处理。
