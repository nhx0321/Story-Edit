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
import { spriteBeanRouter } from './services/sprite-bean/router';
import { adminRouter } from './services/admin/router';
import { feedbackRouter } from './services/feedback/router';
import { tokenRelayRouter } from './services/token-relay/router';
import { migrationRouter } from './services/migration/router';
import { analysisRouter } from './services/analysis/router';
import { videoBackgroundRouter } from './services/video-background/router';

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
  spriteBean: spriteBeanRouter,
  admin: adminRouter,
  feedback: feedbackRouter,
  token: tokenRelayRouter,
  migration: migrationRouter,
  analysis: analysisRouter,
  videoBackground: videoBackgroundRouter,
});

export type AppRouter = typeof appRouter;
