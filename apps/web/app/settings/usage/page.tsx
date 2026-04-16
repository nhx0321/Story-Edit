'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RedirectUsage() {
  const router = useRouter();
  useEffect(() => { router.replace('/ai-config/usage'); }, []);
  return <div className="min-h-screen bg-gray-50 flex items-center justify-center">跳转中...</div>;
}
