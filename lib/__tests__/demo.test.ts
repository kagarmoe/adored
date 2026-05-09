import { describe, it, expect } from 'vitest'
import { isDemoHost, DEMO_HOST } from '@/lib/demo'

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
})
