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

function req(pathname: string, opts: { authed?: boolean } = {}): FakeReq {
  const { authed = true } = opts
  return {
    nextUrl: { pathname },
    headers: { get: () => 'app.example.com' },
    auth: authed ? { user: { id: '1' } } : null,
    url: `https://app.example.com${pathname}`,
  }
}

describe('proxy middleware — auth-only gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoHost.mockReturnValue(false)
    mockIsDemoAllowedPath.mockReturnValue(true)
  })

  it('sends unauthenticated users to /login', () => {
    middleware(req('/collections/2', { authed: false }))
    expect(mockRedirect).toHaveBeenCalledTimes(1)
    expect(mockRedirect.mock.calls[0][0].pathname).toBe('/login')
  })

  it('lets an authenticated user through to /collections/* (per-collection authz is server-side)', () => {
    middleware(req('/collections/2'))
    expect(mockNext).toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('lets an authenticated user through to /dashboard', () => {
    middleware(req('/dashboard'))
    expect(mockNext).toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('lets an authenticated user through to a curator route', () => {
    middleware(req('/2/rank'))
    expect(mockNext).toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('passes /login through without auth', () => {
    middleware(req('/login', { authed: false }))
    expect(mockNext).toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})

describe('proxy middleware — demo host default-deny', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoHost.mockReturnValue(true)
  })

  it('redirects a disallowed demo path to /', () => {
    mockIsDemoAllowedPath.mockReturnValue(false)
    middleware(req('/collections/2', { authed: false }))
    expect(mockRedirect.mock.calls[0][0].pathname).toBe('/')
  })

  it('lets an allowed demo path through', () => {
    mockIsDemoAllowedPath.mockReturnValue(true)
    middleware(req('/2', { authed: false }))
    expect(mockNext).toHaveBeenCalled()
  })
})
