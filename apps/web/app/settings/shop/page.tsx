'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RedirectShop() {
  const router = useRouter();
  useEffect(() => { router.replace('/sprite-shop'); }, []);
  return <div className="min-h-screen bg-gray-50 flex items-center justify-center">跳转中...</div>;
}
