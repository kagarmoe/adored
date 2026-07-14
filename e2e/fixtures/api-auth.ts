import {
  type APIRequestContext,
  type PlaywrightWorkerArgs,
  expect,
} from "@playwright/test";
import {
  BA,
  cookieHeader,
  createSessionCookieForUser,
} from "./better-auth";

const BASE_URL = process.env.AUTH_URL ?? "http://127.0.0.1:3100";

type PlaywrightFixture = PlaywrightWorkerArgs["playwright"];

export interface ApiUser {
  id: string;
  email: string;
}

/**
 * Mint an authenticated `APIRequestContext` for an arbitrary seeded user by
 * inserting a Better Auth session row and sending its signed cookie. This keeps
 * E2E authz coverage without re-enabling email/password sign-in.
 */
export async function apiContextFor(
  playwright: PlaywrightFixture,
  user: ApiUser,
): Promise<APIRequestContext> {
  const sessionCookie = await createSessionCookieForUser(user.id);
  const ctx = await playwright.request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      Origin: BASE_URL,
      Cookie: cookieHeader(sessionCookie),
    },
  });

  const sessionRes = await ctx.get(BA.session);
  expect(sessionRes.ok(), `session request failed for ${user.email}`).toBeTruthy();
  const session = await sessionRes.json();
  expect(
    session?.user?.email,
    `session is not authenticated as ${user.email}`,
  ).toBe(user.email);

  return ctx;
}
