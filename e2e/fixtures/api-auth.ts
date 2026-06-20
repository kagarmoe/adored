import {
  type APIRequestContext,
  type PlaywrightWorkerArgs,
  expect,
} from "@playwright/test";

const BASE_URL = process.env.AUTH_URL ?? "http://127.0.0.1:3100";

// The `playwright` test-fixture's type (typeof import('playwright-core')). We
// take it as a parameter so the helper works inside any test without importing
// the heavy module directly.
type PlaywrightFixture = PlaywrightWorkerArgs["playwright"];

export interface ApiUserCredentials {
  email: string;
  password: string;
}

/**
 * Mint an authenticated `APIRequestContext` for an ARBITRARY user via the
 * NextAuth credentials API — the same deterministic flow `auth.setup.ts` uses
 * for the single baseline user, generalized so one test can hold contexts for
 * TWO distinct users (an owner and a non-owner) at once.
 *
 * Why a fresh `request.newContext()` per user rather than the shared
 * storageState: the harness ships ONE `storageState` (the baseline user).
 * Authz case 3 needs a genuinely DIFFERENT authenticated principal, so each
 * call gets its own cookie jar. The credentials POST lands the session cookie
 * directly in that jar — no storageState file, no cross-user bleed.
 *
 * The returned context is the caller's to use and `dispose()` of.
 */
export async function apiContextFor(
  playwright: PlaywrightFixture,
  { email, password }: ApiUserCredentials,
): Promise<APIRequestContext> {
  // A dedicated cookie jar for THIS user.
  const ctx = await playwright.request.newContext({ baseURL: BASE_URL });

  const csrfRes = await ctx.get(`${BASE_URL}/api/auth/csrf`);
  expect(csrfRes.ok(), `CSRF request failed for ${email}`).toBeTruthy();
  const { csrfToken } = await csrfRes.json();
  expect(csrfToken, `CSRF token missing for ${email}`).toBeTruthy();

  const loginRes = await ctx.post(`${BASE_URL}/api/auth/callback/credentials`, {
    form: { csrfToken, email, password, json: "true" },
  });
  expect(
    loginRes.ok(),
    `credentials callback returned non-2xx for ${email}`,
  ).toBeTruthy();

  // Prove the session is real and belongs to THIS user before handing the
  // context back — a silently-empty session would make every authz assertion
  // pass for the wrong reason.
  const sessionRes = await ctx.get(`${BASE_URL}/api/auth/session`);
  expect(sessionRes.ok(), `session request failed for ${email}`).toBeTruthy();
  const session = await sessionRes.json();
  expect(
    session?.user?.email,
    `session is not authenticated as ${email}`,
  ).toBe(email);

  return ctx;
}
