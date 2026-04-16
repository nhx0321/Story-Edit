'use client';

import { AuthGuard } from '@/components/auth-guard';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
