import { router, publicProcedure } from './trpc';
import { authRouter } from './services/auth/router';
import { aiRouter } from './services/ai-gateway/router';
import { projectRouter } from './services/project/router';
import { creationRouter } from './services/creation-engine/router';
import { memoryRouter } from './services/memory/router';
import { qualityRouter } from './services/quality/router';
import { exportRouter } from './services/export/router';
import { subscriptionRouter } from './services/subscription/router';
import { conversationRouter } from './services/conversation/router';
import { templateRouter } from './services/template/router';
import { userAccountRouter } from './services/user-account/router';
import { workflowRouter } from './services/workflow/router';
import { spriteRouter } from './services/sprite/router';
import { spriteTextRouter } from './services/sprite-text/router';
import { spriteBeanRouter } from './services/sprite-bean/router';
import { adminRouter } from './services/admin/router';

export const appRouter = router({
  health: publicProcedure.query(() => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })),

  auth: authRouter,
  ai: aiRouter,
  project: projectRouter,
  creation: creationRouter,
  memory: memoryRouter,
  quality: qualityRouter,
  export: exportRouter,
  billing: subscriptionRouter,
  conversation: conversationRouter,
  template: templateRouter,
  userAccount: userAccountRouter,
  workflow: workflowRouter,
  sprite: spriteRouter,
  spriteBean: spriteBeanRouter,
  spriteText: spriteTextRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
