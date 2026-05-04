# 2026-05-05 管理员回归基线

## 基线账号
- 昵称：阿木
- 邮箱：nhx0321@163.com
- displayId：UID100000
- 预期权限：总管理员（admin_level = 0）

## 四层回归清单

### 1. 入口显示
预期：Navbar 显示“管理后台”入口。
关键文件：
- `apps/web/components/layout/navbar.tsx`

### 2. 菜单显示
预期：进入 `/admin` 后，左侧可见全部菜单，尤其：
- 权限管理
- 营收仪表盘
- 模型定价
- 渠道管理
- 历史迁移

关键文件：
- `apps/web/app/admin/layout.tsx`
- `docs/release-self-check/baseline/admin-pages-before.txt`

### 3. 页面进入
预期：以下页面可访问，不被前端路由重定向回 `/dashboard`：
- `/admin/permissions`
- `/admin/revenue`
- `/admin/pricing`
- `/admin/channels`
- `/admin/migration`

### 4. 接口可用
预期：
- `auth.me` 返回 `isAdmin / adminLevel / displayId`
- 后端 `adminProcedureLevel(0)` 不对总管理员误判 403
- 相关页面接口不出现 500

关键文件：
- `apps/server/src/services/auth/router.ts`
- `apps/server/src/trpc.ts`
- `apps/server/src/db/migrations/0015_fix_admin.sql`

## 当前代码链保护点
- `admin/layout.tsx`：进入后台后应使用 `trpc.auth.me` 刷新本地权限缓存
- `auth-store.ts`：浏览器 localStorage 键为 `story-edit-auth`，不同浏览器可能保留不同旧状态
- `profile/page.tsx`：更新资料时必须保留管理员字段，不能只写回昵称 / 邮箱
- `trpc.ts`：`adminProcedureLevel(0)` 对 `admin_level = null` 会拒绝，不能只修前端菜单

## 本轮回归目标
- 保住“管理员账号能看到全部管理页面”这一历史可用能力，作为后续任何收口动作的回归基线
