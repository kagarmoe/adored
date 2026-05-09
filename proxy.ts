import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { isDemoHost, isDemoAllowedPath } from '@/lib/demo'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const host = req.headers.get('host')
  const isDemo = isDemoHost(host)
  const isAuth = !!req.auth

  if (pathname === '/login' || pathname.startsWith('/api/auth')) {
    if (isDemo && pathname === '/login') {
      return NextResponse.redirect(new URL('/', req.url))
    }
    return NextResponse.next()
  }

  if (isDemo) {
    // Default-deny: only the explicit allowlist of demo URL shapes pass.
    // Any new authenticated route added later is silently safe by default.
    if (!isDemoAllowedPath(pathname)) {
      return NextResponse.redirect(new URL('/', req.url))
    }
    return NextResponse.next()
  }

  if (!isAuth) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const role = (req.auth?.user as { role?: string })?.role
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/collections')) {
    if (role !== 'operator') {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/photos).*)'],
}
