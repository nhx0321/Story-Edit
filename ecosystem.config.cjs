const path = require('path');

const rootDir = __dirname;
const serverPort = process.env.SERVER_PORT || '3001';
const webPort = process.env.WEB_PORT || process.env.PORT || '3000';

module.exports = {
  apps: [
    {
      name: 'story-edit-server',
      cwd: path.join(rootDir, 'apps/server'),
      script: 'dist/index.mjs',
      interpreter: 'node',
      env_production: {
        NODE_ENV: 'production',
        SERVER_PORT: serverPort,
      },
    },
    {
      name: 'story-edit-web',
      cwd: path.join(rootDir, 'apps/web'),
      script: 'pnpm',
      args: 'start',
      interpreter: 'none',
      env_production: {
        NODE_ENV: 'production',
        PORT: webPort,
      },
    },
  ],
};
