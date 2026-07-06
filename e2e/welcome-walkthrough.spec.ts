import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { EMAIL_PLACEHOLDER, PASSWORD_PLACEHOLDER } from "./fixtures/ui";

// The first-run walkthrough, driven end-to-end in a real browser. Every other
// spec DISARMS the /welcome redirect (auth-navigation.spec sets the dismissal
// cookie); this one is the opposite — a fresh zero-collection user must be
// carried into /welcome and all the way through the six beats.
//
// Fixture design (fights the suite defaults on purpose):
//  - Logged OUT: the project storageState is an authed session that would skip
//    signup and already own collections; clear it so we sign up for real.
//  - A UNIQUE user per project+worker+run: the three device projects share one
//    Postgres serially, so a fixed email would collide (signup is idempotent /
//    anti-enumeration, so a collision 201s WITHOUT creating a user and the
//    walkthrough would never arm). project+worker+timestamp keeps them distinct.
//  - NO dismissal cookie: the redirect firing is the whole point.
test.use({ storageState: { cookies: [], origins: [] } });

const PASSWORD = "walkthrough-password-123";

// Triage item names, in the order the beat asks about them (sampleData:
// TRIAGE_ITEMS = vase, books, cushion — the not-yours item is third). Asserting
// the current name is visible before each tap doubles as a re-render barrier:
// the Love/Like/Not-mine controls are identical across items, so the name is the
// only signal that the beat actually advanced.
const TRIAGE = {
  first: "The glass flower vase",
  second: "The shelf of well-read books",
  third: "The kid's microphone cushion", // the "not mine" item
} as const;

// Sign up a fresh account and wait for the zero-collection redirect to land on
// /welcome. Mirrors e2e/auth.spec.ts's signup exactly (better-auth email+pw).
async function signUpFresh(page: Page, testInfo: TestInfo): Promise<void> {
  const email = `walkthrough-${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}@example.com`;

  await page.goto("/signup");
  const submit = page.getByRole("button", { name: "Create account" });
  await expect(submit).toBeVisible();

  await page.getByPlaceholder(EMAIL_PLACEHOLDER).fill(email);
  // Two password fields share the •••••••• placeholder — [0]=Password,
  // [1]=Confirm.
  const pw = page.getByPlaceholder(PASSWORD_PLACEHOLDER);
  await pw.nth(0).fill(PASSWORD);
  await pw.nth(1).fill(PASSWORD);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/sign-up/email")),
    submit.click(),
  ]);

  // signup client pushes to /collections; the collections server component sees
  // zero collections + no dismissal cookie and redirects on to /welcome.
  await page.waitForURL(/\/welcome/, { timeout: 15_000 });
}

// Walk purpose → triage(×3) → compare → standing → refine, stopping ON the
// handoff beat (its CTA visible, not yet clicked). The intermediate assertions
// are both the spec's teaching-fidelity checks AND the per-beat sync barriers.
async function walkToHandoff(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Show me how" }).click();

  await expect(page.getByText(TRIAGE.first)).toBeVisible();
  await page.getByRole("button", { name: "Love" }).click();

  await expect(page.getByText(TRIAGE.second)).toBeVisible();
  await page.getByRole("button", { name: "Like" }).click();

  await expect(page.getByText(TRIAGE.third)).toBeVisible();
  await page.getByRole("button", { name: /not mine/i }).click(); // set aside

  await page.getByRole("button", { name: "Tie", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Where things stand" })).toBeVisible();
  // The set-aside from item 3 surfaces in its gentle group.
  await expect(page.getByText(/waiting, whenever you want them/i)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click(); // standing → refine

  await expect(page.getByText(/put things in order/i)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click(); // refine → handoff

  await expect(page.getByRole("link", { name: "Start a collection" })).toBeVisible();
}

test("zero-collection first login walks through and hands off", async ({ page }, testInfo) => {
  await signUpFresh(page, testInfo);
  await expect(page).toHaveURL(/\/welcome/);

  await walkToHandoff(page);

  await page.getByRole("link", { name: "Start a collection" }).click();
  await expect(page).toHaveURL(/\/collections\/new/);
});

test("finishing then exploring dismisses for good", async ({ page }, testInfo) => {
  await signUpFresh(page, testInfo);
  await walkToHandoff(page);

  await page.getByRole("button", { name: /explore on my own/i }).click();
  await expect(page).toHaveURL(/\/collections$/);

  // Reload: the dismissal cookie must keep the redirect from re-firing (no
  // /welcome loop). This is the invariant the cookie exists to protect.
  await page.reload();
  await expect(page).toHaveURL(/\/collections$/);
});

test("skip for now mid-walkthrough dismisses too", async ({ page }, testInfo) => {
  await signUpFresh(page, testInfo);

  // Advance a beat or two, then bail via the persistent quiet escape.
  await page.getByRole("button", { name: "Show me how" }).click();
  await expect(page.getByText(TRIAGE.first)).toBeVisible();
  await page.getByRole("button", { name: "Love" }).click();
  await expect(page.getByText(TRIAGE.second)).toBeVisible();

  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/collections$/);

  // Same dismissal invariant as above, reached via Skip rather than the handoff.
  await page.reload();
  await expect(page).toHaveURL(/\/collections$/);
});
