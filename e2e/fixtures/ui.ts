import { type Page } from "@playwright/test";

// Shared UI helpers, locators, and constants for the e2e specs. Single source
// of truth so a form/route change is edited once, not across every spec.

/** Playwright storageState that represents a logged-out browser. */
export const LOGGED_OUT = { cookies: [], origins: [] } as const;

/** Route matchers. /login is a prefix match — withAuth appends ?callbackUrl. */
export const ROUTE = {
  login: /\/login/,
  collections: /\/collections/,
} as const;

/** Read the current context's session user email via the better-auth API, or
 *  null. better-auth's get-session returns { session, user } (or null). */
export async function sessionEmail(page: Page): Promise<string | null> {
  const res = await page.request.get("/api/auth/get-session");
  const session = await res.json().catch(() => ({}));
  return session?.user?.email ?? null;
}

/** True if the document scrolls horizontally (a responsiveness smell). */
export async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}
