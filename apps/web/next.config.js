const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone 模式仅在 Docker 构建时启用（避免 Windows 符号链接权限问题）
  ...(process.env.STANDALONE === '1' ? { output: 'standalone' } : {}),
  transpilePackages: ['@story-edit/shared', '@story-edit/ui'],
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },
  async rewrites() {
    const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return [
      { source: '/trpc/:path*', destination: `${serverUrl}/trpc/:path*` },
    ];
  },
};

module.exports = nextConfig;
