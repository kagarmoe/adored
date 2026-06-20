import { expect, type Page } from "@playwright/test";

// Shared UI helpers, locators, and constants for the e2e specs. Single source
// of truth so a form/route change is edited once, not across every spec.

/** Playwright storageState that represents a logged-out browser. */
export const LOGGED_OUT = { cookies: [], origins: [] } as const;

/** Route matchers. /login is a prefix match — withAuth appends ?callbackUrl. */
export const ROUTE = {
  login: /\/login/,
  collections: /\/collections/,
} as const;

/** Login form locators (the Inputs have no htmlFor, so target by placeholder).
 *  The password field uses a bullet-glyph placeholder shared with the signup
 *  confirm field — keep it here so the fragile glyph lives in exactly one place. */
export const PASSWORD_PLACEHOLDER = "••••••••";
export const EMAIL_PLACEHOLDER = "you@example.com";

/** Read the current context's session user email via the NextAuth API, or null. */
export async function sessionEmail(page: Page): Promise<string | null> {
  const res = await page.request.get("/api/auth/session");
  const session = await res.json().catch(() => ({}));
  return session?.user?.email ?? null;
}

/** Drive the real /login form. Waits for the credentials callback POST so we
 *  never race hydration (the client signIn handler must be attached first). */
export async function submitLogin(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  const submit = page.getByRole("button", { name: "Sign in" });
  await expect(submit).toBeVisible();
  await page.getByPlaceholder(EMAIL_PLACEHOLDER).fill(email);
  await page.getByPlaceholder(PASSWORD_PLACEHOLDER).fill(password);
  await Promise.all([
    page.waitForResponse((r) =>
      r.url().includes("/api/auth/callback/credentials"),
    ),
    submit.click(),
  ]);
}

/** True if the document scrolls horizontally (a responsiveness smell). */
export async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}
