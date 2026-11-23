import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC = new Set([
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/health',
  '/api/cron/ai-employees',
  '/api/agent/context',
  '/api/agent/actions',
]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/_next') || pathname === '/icon.svg' || pathname === '/favicon.ico') return NextResponse.next();
  const token = req.cookies.get('gix_session')?.value;
  if (PUBLIC.has(pathname)) {
    if (token && pathname === '/login') return NextResponse.redirect(new URL('/home', req.url));
    return NextResponse.next();
  }
  if (!token) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico).*)'],
};
