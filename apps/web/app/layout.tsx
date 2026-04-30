import type { Metadata } from 'next';
import { TRPCProvider } from '@/lib/trpc-provider';
import { Navbar } from '@/components/layout/navbar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Story Edit — AI辅助小说创作平台',
  description: '经过实战验证的AI创作工作流引擎，多角色调度、分级记忆、质量把控、经验积累',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <TRPCProvider>
          <Navbar />
          {children}
        </TRPCProvider>
      </body>
    </html>
  );
}
