import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Proxy /trpc/* requests to the backend server
  if (pathname.startsWith('/trpc')) {
    const serverUrl = process.env.NEXT_PUBLIC_API_URL || process.env.SERVER_URL || 'http://localhost:3001';
    const url = new URL(pathname + request.nextUrl.search, serverUrl);

    return NextResponse.rewrite(url, {
      request: {
        headers: request.headers,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/trpc/:path*'],
};
