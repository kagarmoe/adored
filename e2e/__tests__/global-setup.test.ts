import { describe, it, expect } from 'vitest'
import { assertSeedAllowed } from '../global-setup'

describe('assertSeedAllowed', () => {
  it('throws when DATABASE_URL is unset', () => {
    expect(() => assertSeedAllowed({ ALLOW_DEMO_SEED: '1' })).toThrow(
      /DATABASE_URL/,
    )
  })

  it('throws when ALLOW_DEMO_SEED is unset (tripwire against accidental prod seed)', () => {
    expect(() =>
      assertSeedAllowed({ DATABASE_URL: 'postgres://localhost/dev' }),
    ).toThrow(/ALLOW_DEMO_SEED=1/)
  })

  it('throws when ALLOW_DEMO_SEED is set to anything other than "1"', () => {
    expect(() =>
      assertSeedAllowed({
        DATABASE_URL: 'postgres://localhost/dev',
        ALLOW_DEMO_SEED: 'true',
      }),
    ).toThrow(/ALLOW_DEMO_SEED=1/)
  })

  it('returns silently when both DATABASE_URL and ALLOW_DEMO_SEED=1 are set', () => {
    expect(() =>
      assertSeedAllowed({
        DATABASE_URL: 'postgres://localhost/dev',
        ALLOW_DEMO_SEED: '1',
      }),
    ).not.toThrow()
  })
})
