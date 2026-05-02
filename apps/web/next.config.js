const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.STANDALONE === '1' ? { output: 'standalone' } : {}),
  transpilePackages: ['@story-editor/shared', '@story-editor/ui'],
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },
  async rewrites() {
    return [
      {
        source: '/trpc/:path*',
        destination: 'http://39.107.102.43:3001/trpc/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
