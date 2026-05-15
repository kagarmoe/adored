/**
 * Integration test for the magic-link SEND flow, exercising the real
 * @auth/core `sendToken` seam — NOT signInCallback in isolation.
 *
 * The production-down bug (purses-e7f): @auth/core's send-token flow runs the
 * `signIn` callback AT SEND TIME with a throwaway `defaultUser` for any email
 * not already in the DB. A `signIn` callback that gates on `dbUser` returns
 * false for that throwaway user, @auth/core throws `AccessDenied`, and
 * `sendVerificationRequest` is never reached — so the email never sends and
 * nobody can sign up.
 *
 * This test drives the actual `Auth()` handler with a spied
 * `sendVerificationRequest`. It MUST fail while `signInCallback` gates on
 * `dbUser` and pass once it allows any verified email.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Auth, skipCSRFCheck } from '@auth/core'
import Resend from 'next-auth/providers/resend'

const mockDb = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn() },
  verificationToken: { create: vi.fn(), delete: vi.fn() },
  collectionInvite: { findMany: vi.fn() },
  collectionMembership: { upsert: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db: mockDb }))

import { PurseAdapter } from '@/lib/auth-adapter'
import { signInCallback, jwtCallback, sessionCallback } from '@/lib/auth-callbacks'

// Mirrors auth.ts — same adapter, same callbacks. Only sendVerificationRequest
// is swapped for a spy so we can assert the send was reached.
function buildConfig(sendSpy: ReturnType<typeof vi.fn>): Parameters<typeof Auth>[1] {
  return {
    secret: 'test-secret-must-be-at-least-32-characters-long',
    trustHost: true,
    basePath: '/api/auth',
    skipCSRFCheck,
    adapter: PurseAdapter(),
    providers: [
      Resend({
        from: 'PurseInator <onboarding@resend.dev>',
        apiKey: 're_test',
        // Spy stands in for the real Resend send; a 0-arg fn is assignable to
        // the (params) => Awaitable<void> slot.
        sendVerificationRequest: sendSpy as unknown as () => Promise<void>,
      }),
    ],
    callbacks: {
      signIn: ({ user }: { user: { email?: string | null } }) => signInCallback({ user }),
      jwt: jwtCallback,
      session: sessionCallback,
    },
  } as Parameters<typeof Auth>[1]
}

function sendRequest(email: string) {
  return new Request('https://app.test/api/auth/signin/resend', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email }),
  })
}

describe('magic-link send flow (real @auth/core sendToken seam)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.verificationToken.create.mockResolvedValue({})
  })

  it('an unknown email (not in the DB) still triggers a magic-link send', async () => {
    // The defining case: a brand-new visitor whose email is not yet a User row.
    mockDb.user.findUnique.mockResolvedValue(null)
    const sendSpy = vi.fn().mockResolvedValue(undefined)

    await Auth(sendRequest('brand-new@example.com'), buildConfig(sendSpy))

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0].identifier).toBe('brand-new@example.com')
  })

  it('an existing user also still receives a magic link', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 1, email: 'known@example.com', name: 'Known' })
    mockDb.collectionInvite.findMany.mockResolvedValue([])
    const sendSpy = vi.fn().mockResolvedValue(undefined)

    await Auth(sendRequest('known@example.com'), buildConfig(sendSpy))

    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  it('redirects to the verify-request page after a successful send', async () => {
    mockDb.user.findUnique.mockResolvedValue(null)
    const sendSpy = vi.fn().mockResolvedValue(undefined)

    const response = await Auth(sendRequest('brand-new@example.com'), buildConfig(sendSpy))

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('verify-request')
  })
})
