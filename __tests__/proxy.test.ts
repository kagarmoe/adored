import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRedirect = vi.hoisted(() => vi.fn((url: URL) => ({ kind: 'redirect', url })))
const mockNext = vi.hoisted(() => vi.fn(() => ({ kind: 'next' })))
const mockIsDemoHost = vi.hoisted(() => vi.fn())
const mockIsDemoAllowedPath = vi.hoisted(() => vi.fn())

// `auth(handler)` normally returns NextAuth middleware; for the unit test we
// unwrap it so `default` is the bare handler we can call directly.
vi.mock('@/auth', () => ({ auth: (handler: unknown) => handler }))
vi.mock('next/server', () => ({
  NextResponse: { redirect: mockRedirect, next: mockNext },
}))
vi.mock('@/lib/demo', () => ({
  isDemoHost: (...a: unknown[]) => mockIsDemoHost(...a),
  isDemoAllowedPath: (...a: unknown[]) => mockIsDemoAllowedPath(...a),
}))

import proxyDefault from '@/proxy'

type FakeReq = {
  nextUrl: { pathname: string }
  headers: { get: (k: string) => string | null }
  auth: unknown
  url: string
}

// `auth` is mocked to return the bare handler; call it with just the request.
const middleware = proxyDefault as unknown as (req: FakeReq) => unknown

function req(pathname: string, opts: { role?: string; authed?: boolean } = {}): FakeReq {
  const { role, authed = true } = opts
  return {
    nextUrl: { pathname },
    headers: { get: () => 'app.example.com' },
    auth: authed ? { user: role ? { role } : {} } : null,
    url: `https://app.example.com${pathname}`,
  }
}

describe('proxy middleware — operator-only gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoHost.mockReturnValue(false)
    mockIsDemoAllowedPath.mockReturnValue(true)
  })

  it('redirects a non-operator off /collections/* with a non-silent denied marker', () => {
    middleware(req('/collections/2', { role: 'curator' }))
    expect(mockRedirect).toHaveBeenCalledTimes(1)
    const target = mockRedirect.mock.calls[0][0]
    expect(target.pathname).toBe('/')
    expect(target.searchParams.get('denied')).toBe('operator')
  })

  it('redirects a non-operator off /dashboard with the same denied marker', () => {
    middleware(req('/dashboard', { role: 'curator' }))
    const target = mockRedirect.mock.calls[0][0]
    expect(target.searchParams.get('denied')).toBe('operator')
  })

  it('lets an operator through to /collections/*', () => {
    middleware(req('/collections/2', { role: 'operator' }))
    expect(mockNext).toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('still sends unauthenticated users to /login', () => {
    middleware(req('/collections/2', { authed: false }))
    const target = mockRedirect.mock.calls[0][0]
    expect(target.pathname).toBe('/login')
  })
})
