// 加载环境变量（monorepo 根目录 .env）
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

function loadEnv() {
  // turbo dev 从 monorepo 根目录运行，process.cwd() 指向 apps/server
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
  ];
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
    break;
  }
}
loadEnv();

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyTRPCPlugin, type CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { appRouter } from './router';
import { verifyToken } from './services/auth/utils';
import { registerAiStreamRoute } from './routes/ai-stream';
import { registerPlatformAiStreamRoute, registerChannelTestRoute } from './routes/ai-stream-platform';
import { registerExternalApiRoute } from './routes/api-v1';
import { registerCleanupScheduler } from './services/project/cleanup';
import { cleanupExpiredJobs } from './services/ai-job/manager';
import { checkChannelHealth } from './services/token-relay/channel-manager';
import { recoverStaleAnalyses } from './services/analysis/router';
import type { Context } from './trpc';

const app = Fastify({ logger: true, maxParamLength: 5000, bodyLimit: 20 * 1024 * 1024 });

app.register(cors, {
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }: CreateFastifyContextOptions): Context => {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const payload = verifyToken(token);
        if (payload) return { userId: payload.userId };
      }
      return {};
    },
  },
});

app.get('/health', async () => ({ status: 'ok' }));

// AI 流式输出 SSE 端点
registerAiStreamRoute(app);
registerPlatformAiStreamRoute(app);
registerChannelTestRoute(app);
// 站外 API 端点（OpenAI 兼容）
registerExternalApiRoute(app);

const start = async () => {
  try {
    const port = Number(process.env.SERVER_PORT) || 3001;
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Server running on http://localhost:${port}`);

    // 注册已删除项目自动清理任务（每小时执行）
    registerCleanupScheduler();
    // AI 流式任务清理（每小时执行）
    setInterval(() => cleanupExpiredJobs().catch(() => {}), 3600000);
    // 渠道健康检查（每10分钟执行）
    setInterval(() => checkChannelHealth().catch(() => {}), 600000);
    // 启动时立即执行一次
    checkChannelHealth().catch(() => {});
    // 恢复因服务重启而中断的分析任务
    recoverStaleAnalyses().then(count => {
      if (count > 0) console.log(`已恢复 ${count} 个中断的分析任务`);
    }).catch(() => {});
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
