import { test as base, expect, type Page } from '@playwright/test'

// Sets a forged NextAuth JWT session cookie so tests bypass email auth.
// Requires AUTH_SECRET in env (inherited from .env.local in dev).
async function setSessionCookie(page: Page, payload: Record<string, unknown>) {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET not set — cannot forge test session')

  // Dynamically import encode to avoid build-time issues
  const { encode } = await import('@auth/core/jwt')
  const token = await encode({
    token: payload,
    secret,
    salt: 'authjs.session-token',
  })

  await page.context().addCookies([{
    name: 'authjs.session-token',
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  }])
}

type Fixtures = {
  operatorPage: Page
  curatorPage: Page
}

// Role is per-collection now (CollectionMembership) — the JWT no longer carries
// a global role. These fixtures forge an authenticated session; per-collection
// authorization is exercised against real membership rows (the demo seed grants
// the demo owner an operator membership). The `operatorPage` / `curatorPage`
// names are kept for spec readability — both are just "an authenticated user".
export const test = base.extend<Fixtures>({
  operatorPage: async ({ page }, use) => {
    await page.goto('/')
    await setSessionCookie(page, {
      sub: '1',
      id: '1',
      email: 'operator@test.local',
      name: 'Test Operator',
    })
    await use(page)
  },

  curatorPage: async ({ page }, use) => {
    await page.goto('/')
    await setSessionCookie(page, {
      sub: '2',
      id: '2',
      email: 'curator@test.local',
      name: 'Test Curator',
    })
    await use(page)
  },
})

export { expect }
