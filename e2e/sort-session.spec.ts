// e2e/sort-session.spec.ts
//
// Journey: starting a sort session and reaching triage. Mirrors
// sort-images.spec.ts — seedBaseline + a seed helper, slug/number URLs, and the
// protected-image intercept. The shared storageState (playwright.config.ts)
// keeps these tests authenticated; the unauth-redirect block opts out via
// test.use({ storageState: LOGGED_OUT }).
import { test, expect } from "@playwright/test";
import {
  seedBaseline,
  seedCollections,
  seedJourneyScenario,
  seedTriageScenario,
} from "./fixtures/seed";
import { ROUTE } from "./fixtures/ui";

// Fulfil every protected /file request with a local fixture so triage's hero
// renders without a blob emulator (same approach as sort-images.spec.ts).
const PHOTO_FIXTURE = "e2e/fixtures/photos/cc0-01.jpg";

test.describe("sort session → triage", () => {
  let slug: string;
  let sessionNumber: number;
  // A separate collection with NO active session, so StartSessionForm can create
  // one. seedTriageScenario's collection already has an active session and the
  // API enforces one-active-session-per-(collection,curator).
  let freshCollectionId: string;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug, sessionNumber } = await seedTriageScenario(ownerId));
    [freshCollectionId] = await seedCollections(ownerId, 1);
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: PHOTO_FIXTURE, contentType: "image/jpeg" }),
    );
  });

  test("triage renders the current item via slug/number URLs (never a raw ULID)", async ({
    page,
  }) => {
    await page.goto(`/collections/${slug}/sort/${sessionNumber}/triage`);

    // Slug/number addressing: the collection segment is the slug, the session
    // segment is the per-collection number — never a bare `/collections/col_…`
    // ULID segment. (This fixture's slug intentionally embeds the ULID, so we
    // assert the *segment shape* rather than ULID-absence.)
    await expect(page).toHaveURL(
      new RegExp(`/collections/${slug}/sort/${sessionNumber}/triage`),
    );
    expect(page.url()).not.toMatch(/\/collections\/col_[^/]+\/sort/);

    await expect(page.getByRole("heading", { name: "How do you feel about this one?", exact: true })).toBeVisible();
    // A pending item is shown with its hero photo (authenticated image render).
    await expect(page.getByRole("img").first()).toBeVisible();
    // Tier buttons are the tap-first affordance.
    await expect(page.getByRole("button", { name: "Love" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Onward" })).toBeVisible();
  });

  test("reload preserves the session (still on triage, same item)", async ({
    page,
  }) => {
    await page.goto(`/collections/${slug}/sort/${sessionNumber}/triage`);
    await expect(page.getByRole("heading", { name: "How do you feel about this one?", exact: true })).toBeVisible();

    await page.reload();

    // Same session, same URL, same pending item after a reload — no bounce to
    // /sort or /login, no lost session.
    await expect(page).toHaveURL(
      new RegExp(`/collections/${slug}/sort/${sessionNumber}/triage`),
    );
    await expect(page.getByRole("heading", { name: "How do you feel about this one?", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Love" })).toBeVisible();
  });

  // Product contract: starting a session lands the curator DIRECTLY on triage.
  // The session-detail page stays reachable via the breadcrumb, but the create
  // flow does not stop there — StartSessionForm POSTs /api/sessions then
  // router.push()es straight to /sort/{number}/triage. Uses the sessionless
  // collection so the create succeeds (the API enforces one active session per
  // collection/curator); this collection has no slug, so it is addressed by its
  // ULID — orthogonal to the slug check, which the triage test above pins.
  test("StartSessionForm at /sort/new creates a session and lands DIRECTLY on triage", async ({
    page,
  }) => {
    await page.goto(`/collections/${freshCollectionId}/sort/new`);
    await expect(
      page.getByRole("heading", { name: "New sorting session" }),
    ).toBeVisible();

    const start = page.getByRole("button", { name: "Start session" });
    await expect(start).toBeVisible();

    await Promise.all([
      page.waitForURL(/\/sort\/\d+\/triage$/),
      start.click(),
    ]);
    await expect(page).toHaveURL(/\/sort\/\d+\/triage$/);

    // The numbered session resolves and the triage screen renders for the freshly
    // created session (this fresh collection has no items, so it shows the empty
    // state — the point here is the route landed and resolved, not item
    // rendering, which the first test pins).
    expect(
      page.url().match(/\/sort\/(\d+)\/triage$/),
      "expected a numeric session in the triage landing URL",
    ).not.toBeNull();
    await expect(page.getByRole("heading", { name: "How do you feel about this one?", exact: true })).toBeVisible();
  });
});

// The live results affordance: the whole sort → results seam exercised through
// the real UI (real API, real DB) — triage a decision, compare a pair, return to
// the session, then the SeeResultsCard creates a populated result and lands on
// it. Uses seedJourneyScenario (fresh, untriaged) so nothing is pre-baked.
test.describe("session detail → See what you love most → results", () => {
  let slug: string;
  let sessionNumber: number;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug, sessionNumber } = await seedJourneyScenario(ownerId, 2));
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: PHOTO_FIXTURE, contentType: "image/jpeg" }),
    );
  });

  test("triage a decision → compare a pair → the trigger creates a populated result and navigates to it", async ({
    page,
  }) => {
    // 1. Land on triage and triage BOTH items consecutively. This is the honest
    //    multi-item demonstration (regression for U2): after a tier tap the
    //    control POSTs the decision then router.refresh()es to the next item, and
    //    the reused client instance MUST re-enable its tiers — otherwise a normal
    //    user is stuck on item 1 with every button frozen on "Saving...".
    await page.goto(`/collections/${slug}/sort/${sessionNumber}/triage`);
    await expect(page.getByRole("heading", { name: "How do you feel about this one?", exact: true })).toBeVisible();

    // Item 1: tap a tier, then confirm the page advanced (the second item is now
    // pending) via the ceiling-free decided cue, AND that the tiers re-enabled for item 2.
    await page.getByRole("button", { name: "Love" }).click();
    await expect(page.getByText("1 decided so far")).toBeVisible();
    await expect(page.getByRole("button", { name: "Love" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Onward" })).toBeEnabled();

    // Item 2: a second tap must succeed on the re-enabled control and complete
    // triage (2 decided) — the proof a user can actually sort past the first item.
    await page.getByRole("button", { name: "Like" }).click();
    await expect(page.getByText("2 decided so far")).toBeVisible();

    // 2. Move to compare and choose one card (tapping a card IS the choice).
    await page.goto(`/collections/${slug}/sort/${sessionNumber}/compare`);
    await expect(
      page.getByRole("heading", { name: "Which do you love more?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Choose / }).first().click();

    // 3. Return to the session detail (the breadcrumb's "Session" target).
    await page.getByRole("link", { name: "Session" }).first().click();
    await expect(page.getByRole("heading", { name: "Sorting session" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/collections/${slug}/sort/${sessionNumber}$`));

    // 4. The inert "View Results" card is gone; the reachable trigger is present.
    await expect(page.getByText("See what you love most")).toBeVisible();
    const trigger = page.getByRole("button", { name: "Show me what I love" });
    await expect(trigger).toBeVisible();

    // 5. Tap it → POST /api/sort-results materializes a draft and we land on it.
    await Promise.all([
      page.waitForURL(new RegExp(`/collections/${slug}/results/\\d+$`)),
      trigger.click(),
    ]);
    await expect(page).toHaveURL(new RegExp(`/collections/${slug}/results/\\d+$`));

    // 6. The results page shows ranked items (≥1 tier populated): the most-loved
    //    hero renders for the top-ranked item. Exact match: the page also ends on
    //    the affirmation "What you love most is at the top." (o93), which would
    //    otherwise make this a strict-mode 2-element match.
    await expect(page.getByText("What you love most", { exact: true })).toBeVisible();
    await expect(page.getByRole("img").first()).toBeVisible();
  });

  test("if the result can't be created, a soft message appears, the button re-enables, and we stay put", async ({
    page,
  }) => {
    await page.goto(`/collections/${slug}/sort/${sessionNumber}`);
    await expect(page.getByRole("heading", { name: "Sorting session" })).toBeVisible();

    // Force the create to fail at the network edge (real UI, no unit mock).
    await page.route("**/api/sort-results", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );

    const trigger = page.getByRole("button", { name: "Show me what I love" });
    await trigger.click();

    // Soft, reversible, nothing-lost copy — and we never left the session page.
    await expect(
      page.getByText(
        "That didn't come together just now. Nothing was lost — try again whenever you like.",
      ),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/collections/${slug}/sort/${sessionNumber}$`));
    // The button is re-enabled (and back to its resting label), so the person can retry.
    await expect(page.getByRole("button", { name: "Show me what I love" })).toBeEnabled();
  });
});

test.describe("unauthenticated sort access", () => {
  // Logged-out browser: protected sort URLs must bounce to /login. Build a fresh
  // mutable StorageState (LOGGED_OUT is `as const`, whose readonly arrays the
  // StorageState type rejects).
  test.use({ storageState: { cookies: [], origins: [] } });

  test("goto of a protected sort URL redirects to /login", async ({ page }) => {
    // A plausible-looking sort URL; middleware should redirect before any data
    // is resolved, so the exact slug/number need not exist.
    await page.goto("/collections/some-collection/sort/1/triage");
    await expect(page).toHaveURL(ROUTE.login);
  });

  test("goto of a protected compare URL redirects to /login", async ({
    page,
  }) => {
    await page.goto("/collections/some-collection/sort/1/compare");
    await expect(page).toHaveURL(ROUTE.login);
  });
});
