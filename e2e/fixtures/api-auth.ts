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
 * BETTER-AUTH sign-in API (Cutover Pass 2a) — generalized so one test can hold
 * contexts for TWO distinct users (an owner and a non-owner) at once.
 *
 * Why a fresh `request.newContext()` per user rather than the shared
 * storageState: the harness ships ONE `storageState` (the baseline user).
 * Authz case 3 needs a genuinely DIFFERENT authenticated principal, so each
 * call gets its own cookie jar. The sign-in POST lands the
 * `better-auth.session_token` cookie directly in that jar — no storageState
 * file, no cross-user bleed. The user must already exist in better-auth (the
 * seed creates it via createBetterAuthUser).
 *
 * The returned context is the caller's to use and `dispose()` of.
 */
export async function apiContextFor(
  playwright: PlaywrightFixture,
  { email, password }: ApiUserCredentials,
): Promise<APIRequestContext> {
  // A dedicated cookie jar for THIS user. better-auth's originCheck rejects a
  // POST with no Origin (403 MISSING_OR_NULL_ORIGIN); a bare request context
  // sends none, so set it to the server's own origin for every request.
  const ctx = await playwright.request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Origin: BASE_URL },
  });

  const loginRes = await ctx.post(`${BASE_URL}/api/auth/sign-in/email`, {
    data: { email, password },
  });
  expect(
    loginRes.ok(),
    `better-auth sign-in returned non-2xx for ${email}`,
  ).toBeTruthy();

  // Prove the session is real and belongs to THIS user before handing the
  // context back — a silently-empty session would make every authz assertion
  // pass for the wrong reason.
  const sessionRes = await ctx.get(`${BASE_URL}/api/auth/get-session`);
  expect(sessionRes.ok(), `session request failed for ${email}`).toBeTruthy();
  const session = await sessionRes.json();
  expect(
    session?.user?.email,
    `session is not authenticated as ${email}`,
  ).toBe(email);

  return ctx;
}
