import { test, expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import {
  createBetterAuthUser,
  createSessionCookieForUser,
} from "./fixtures/better-auth";

// The first-run walkthrough, driven end-to-end in a real browser. Every other
// spec DISARMS the /welcome redirect (auth-navigation.spec sets the dismissal
// cookie); this one is the opposite — a fresh zero-collection user must be
// carried into /welcome and all the way through the five beats.
//
// Fixture design (fights the suite defaults on purpose):
//  - Logged OUT: the project storageState is an authed session; clear it so we
//    create a fresh zero-collection user.
//  - A UNIQUE user per project+worker+run: the three device projects share one
//    Postgres serially, so a fixed email would collide. project+worker+timestamp
//    keeps them distinct.
//  - NO dismissal cookie: the redirect firing is the whole point.
test.use({ storageState: { cookies: [], origins: [] } });

// Create a fresh Google-linked account and wait for the zero-collection
// redirect to land on /welcome.
async function signInFresh(
  page: Page,
  context: BrowserContext,
  testInfo: TestInfo,
): Promise<void> {
  const email = `walkthrough-${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}@example.com`;
  const user = await createBetterAuthUser(email, "Walkthrough E2E");
  const sessionCookie = await createSessionCookieForUser(user.id);
  await context.addCookies([sessionCookie]);

  // /collections sees zero collections + no dismissal cookie and redirects on
  // to /welcome.
  await page.goto("/collections");
  await page.waitForURL(/\/welcome/, { timeout: 15_000 });
}

// Walk purpose → feelings (×3) → pairs → ranking, stopping ON the hand-off beat
// (its CTA visible, not yet clicked). The intermediate assertions are both the
// spec's teaching-fidelity checks AND the per-beat sync barriers.
async function walkToHandoff(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Show me how" }).click();
  await expect(page.getByRole("heading", { name: "How do you feel about this one?" })).toBeVisible();
  await page.getByRole("button", { name: "Love", exact: true }).click();
  await page.getByRole("button", { name: "Like", exact: true }).click();
  await page.getByRole("button", { name: /not mine/i }).click(); // set aside
  await expect(page.getByRole("heading", { name: "Which would you reach for first?" })).toBeVisible();
  await page.getByRole("button", { name: "Tie", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your ranking so far" })).toBeVisible();
  await expect(page.getByText(/waiting, whenever you want them/i)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("link", { name: "Start a collection" })).toBeVisible();
}

test("zero-collection first login walks through and hands off", async ({ context, page }, testInfo) => {
  await signInFresh(page, context, testInfo);
  await expect(page).toHaveURL(/\/welcome/);

  await walkToHandoff(page);

  await page.getByRole("link", { name: "Start a collection" }).click();
  await expect(page).toHaveURL(/\/collections\/new/);
});

test("finishing then exploring dismisses for good", async ({ context, page }, testInfo) => {
  await signInFresh(page, context, testInfo);
  await walkToHandoff(page);

  await page.getByRole("button", { name: /explore on my own/i }).click();
  await expect(page).toHaveURL(/\/collections$/);

  // Reload: the dismissal cookie must keep the redirect from re-firing (no
  // /welcome loop). This is the invariant the cookie exists to protect.
  await page.reload();
  await expect(page).toHaveURL(/\/collections$/);
});

test("leave tutorial mid-walkthrough dismisses too", async ({ context, page }, testInfo) => {
  await signInFresh(page, context, testInfo);

  // Advance a beat or two, then bail via the persistent quiet escape.
  await page.getByRole("button", { name: "Show me how" }).click();
  await expect(page.getByRole("heading", { name: "How do you feel about this one?" })).toBeVisible();
  await page.getByRole("button", { name: "Love" }).click();

  await page.getByRole("button", { name: "Leave tutorial" }).click();
  await expect(page).toHaveURL(/\/collections$/);

  // Same dismissal invariant as above, reached via the persistent tutorial exit
  // rather than the handoff.
  await page.reload();
  await expect(page).toHaveURL(/\/collections$/);
});
