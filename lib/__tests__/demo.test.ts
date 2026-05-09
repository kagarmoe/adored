import { describe, it, expect, afterEach } from 'vitest'
import { isDemoHost, isDemoAllowedPath, DEMO_HOST } from '@/lib/demo'

describe('isDemoHost', () => {
  it('returns true for the canonical demo host', () => {
    expect(isDemoHost(DEMO_HOST)).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isDemoHost(DEMO_HOST.toUpperCase())).toBe(true)
  })

  it('strips port before matching', () => {
    expect(isDemoHost(`${DEMO_HOST}:443`)).toBe(true)
  })

  it('returns true for vercel preview URLs that start with the demo prefix', () => {
    expect(isDemoHost('purseinator-demo-abc123-kagarmoe.vercel.app')).toBe(true)
  })

  it('returns false for production host', () => {
    expect(isDemoHost('purseinator.kimberlygarmoe.com')).toBe(false)
  })

  it('returns false for production preview vercel URLs', () => {
    expect(isDemoHost('purseinator-app-xyz.vercel.app')).toBe(false)
  })

  it('returns false for null/undefined/empty', () => {
    expect(isDemoHost(null)).toBe(false)
    expect(isDemoHost(undefined)).toBe(false)
    expect(isDemoHost('')).toBe(false)
  })

  it('returns false for localhost', () => {
    expect(isDemoHost('localhost:3000')).toBe(false)
  })

  it('does not match a host that just contains the substring', () => {
    expect(isDemoHost('not-purseinator-demo.example.com')).toBe(false)
  })

  describe('DEMO_HOST_TEST_OVERRIDE env var', () => {
    afterEach(() => {
      delete process.env.DEMO_HOST_TEST_OVERRIDE
    })

    it('treats an overridden host as a demo host', () => {
      process.env.DEMO_HOST_TEST_OVERRIDE = 'localhost:3000'
      expect(isDemoHost('localhost:3000')).toBe(true)
    })

    it('matches the bare hostname when the override has no port', () => {
      process.env.DEMO_HOST_TEST_OVERRIDE = 'localhost'
      expect(isDemoHost('localhost:3000')).toBe(true)
    })

    it('accepts a comma-separated list of overrides', () => {
      process.env.DEMO_HOST_TEST_OVERRIDE = '127.0.0.1:4000, localhost:3000'
      expect(isDemoHost('localhost:3000')).toBe(true)
      expect(isDemoHost('127.0.0.1:4000')).toBe(true)
    })

    it('is case-insensitive', () => {
      process.env.DEMO_HOST_TEST_OVERRIDE = 'LOCALHOST:3000'
      expect(isDemoHost('localhost:3000')).toBe(true)
    })

    it('does not match hosts outside the override list', () => {
      process.env.DEMO_HOST_TEST_OVERRIDE = 'localhost:3000'
      expect(isDemoHost('example.com')).toBe(false)
      expect(isDemoHost('localhost:9999')).toBe(false)
    })

    it('an empty override is treated as unset (no localhost match)', () => {
      process.env.DEMO_HOST_TEST_OVERRIDE = ''
      expect(isDemoHost('localhost:3000')).toBe(false)
    })
  })
})

describe('isDemoAllowedPath', () => {
  it('allows the demo home', () => {
    expect(isDemoAllowedPath('/')).toBe(true)
  })

  it('allows the curator collection view for any numeric id', () => {
    expect(isDemoAllowedPath('/1')).toBe(true)
    expect(isDemoAllowedPath('/42')).toBe(true)
    expect(isDemoAllowedPath('/12345')).toBe(true)
  })

  it('allows the rank session picker', () => {
    expect(isDemoAllowedPath('/1/rank')).toBe(true)
  })

  it('allows the compare page', () => {
    expect(isDemoAllowedPath('/1/rank/compare')).toBe(true)
  })

  it('rejects arbitrary paths so default-deny applies', () => {
    expect(isDemoAllowedPath('/foo')).toBe(false)
    expect(isDemoAllowedPath('/api/whatever')).toBe(false)
    expect(isDemoAllowedPath('/dashboard')).toBe(false)
    expect(isDemoAllowedPath('/collections')).toBe(false)
    expect(isDemoAllowedPath('/login')).toBe(false)
    expect(isDemoAllowedPath('/1/extra')).toBe(false)
    expect(isDemoAllowedPath('/1/rank/extra')).toBe(false)
    expect(isDemoAllowedPath('/1/rank/compare/extra')).toBe(false)
  })

  it('rejects non-numeric ids', () => {
    expect(isDemoAllowedPath('/abc')).toBe(false)
    expect(isDemoAllowedPath('/abc/rank')).toBe(false)
  })

  it('rejects trailing slash variants to keep the matcher tight', () => {
    expect(isDemoAllowedPath('/1/')).toBe(false)
    expect(isDemoAllowedPath('/1/rank/')).toBe(false)
  })
})
