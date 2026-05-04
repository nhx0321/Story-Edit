const path = require('path');

const serverUrl = process.env.NEXT_PUBLIC_API_URL || process.env.SERVER_URL || 'http://127.0.0.1:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.STANDALONE === '1' ? { output: 'standalone' } : {}),
  transpilePackages: ['@story-edit/shared', '@story-edit/ui'],
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },
  async rewrites() {
    return [
      {
        source: '/trpc/:path*',
        destination: `${serverUrl}/trpc/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;