import { test, expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import {
  createBetterAuthUser,
  createSessionCookieForUser,
} from "./fixtures/better-auth";

// The first-run walkthrough, driven end-to-end in a real browser. Every other
// spec DISARMS the /welcome redirect (auth-navigation.spec sets the dismissal
// cookie); this one is the opposite — a fresh zero-collection user must be
// carried into /welcome and all the way through the six beats.
//
// Fixture design (fights the suite defaults on purpose):
//  - Logged OUT: the project storageState is an authed session; clear it so we
//    create a fresh zero-collection user.
//  - A UNIQUE user per project+worker+run: the three device projects share one
//    Postgres serially, so a fixed email would collide. project+worker+timestamp
//    keeps them distinct.
//  - NO dismissal cookie: the redirect firing is the whole point.
test.use({ storageState: { cookies: [], origins: [] } });

// Triage item names, in the order the beat asks about them (sampleData:
// TRIAGE_ITEMS = armchair, clock, vase — the not-yours item is third). Asserting
// the current name is visible before each tap doubles as a re-render barrier:
// the Love/Like/Not-mine controls are identical across items, so the name is the
// only signal that the beat actually advanced.
const TRIAGE = {
  first: "The slipcovered armchair",
  second: "The little red wall clock",
  third: "The glass flower vase", // the "not mine" item
} as const;

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

// Walk purpose → triage(×3) → triage standing → usage(×3) → usage standing →
// compare → final standing → refine, stopping ON the handoff beat (its CTA
// visible, not yet clicked). The intermediate assertions are both the spec's
// teaching-fidelity checks AND the per-beat sync barriers.
async function walkToHandoff(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Show me how" }).click();

  await expect(page.getByText(TRIAGE.first)).toBeVisible();
  await page.getByRole("button", { name: "Love" }).click();

  await expect(page.getByText(TRIAGE.second)).toBeVisible();
  await page.getByRole("button", { name: "Like" }).click();

  await expect(page.getByText(TRIAGE.third)).toBeVisible();
  await page.getByRole("button", { name: /not mine/i }).click(); // set aside

  await expect(page.getByRole("heading", { name: "After Triage" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Usage beat — "Do you use this?" asks about the whole sample collection.
  await expect(page.getByRole("heading", { name: "Do you use this?" })).toBeVisible();
  await expect(page.getByText(TRIAGE.first)).toBeVisible();
  await page.getByRole("button", { name: "Yes, I use it" }).click();

  await expect(page.getByText(TRIAGE.second)).toBeVisible();
  await page.getByRole("button", { name: "Not these days" }).click();

  await expect(page.getByText(TRIAGE.third)).toBeVisible();
  await page.getByRole("button", { name: /^Skip for now/ }).click();

  await expect(page.getByRole("heading", { name: "After Usage" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Tie", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Where things stand" })).toBeVisible();
  // The set-aside from item 3 surfaces in its gentle group.
  await expect(page.getByText(/waiting, whenever you want them/i)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click(); // standing → refine

  await expect(page.getByText(/Adjust results/i)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click(); // refine → handoff

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
  await expect(page.getByText(TRIAGE.first)).toBeVisible();
  await page.getByRole("button", { name: "Love" }).click();
  await expect(page.getByText(TRIAGE.second)).toBeVisible();

  await page.getByRole("button", { name: "Leave tutorial" }).click();
  await expect(page).toHaveURL(/\/collections$/);

  // Same dismissal invariant as above, reached via the persistent tutorial exit
  // rather than the handoff.
  await page.reload();
  await expect(page).toHaveURL(/\/collections$/);
});
