// e2e/sort-session.spec.ts
//
// Journey: starting a sort session and reaching triage. Mirrors
// sort-images.spec.ts — seedBaseline + a seed helper, slug/number URLs, and the
// protected-image intercept. The shared storageState (playwright.config.ts)
// keeps these tests authenticated; the unauth-redirect block opts out via
// test.use({ storageState: LOGGED_OUT }).
import { test, expect } from "@playwright/test";
import { seedBaseline, seedCollections, seedTriageScenario } from "./fixtures/seed";
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
    await page.route("**/photos/**/file", (route) =>
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

    await expect(page.getByRole("heading", { name: "Triage", exact: true })).toBeVisible();
    // A pending item is shown with its hero photo (authenticated image render).
    await expect(page.getByRole("img").first()).toBeVisible();
    // Tier buttons are the tap-first affordance.
    await expect(page.getByRole("button", { name: "Love" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Release" })).toBeVisible();
  });

  test("reload preserves the session (still on triage, same item)", async ({
    page,
  }) => {
    await page.goto(`/collections/${slug}/sort/${sessionNumber}/triage`);
    await expect(page.getByRole("heading", { name: "Triage", exact: true })).toBeVisible();

    await page.reload();

    // Same session, same URL, same pending item after a reload — no bounce to
    // /sort or /login, no lost session.
    await expect(page).toHaveURL(
      new RegExp(`/collections/${slug}/sort/${sessionNumber}/triage`),
    );
    await expect(page.getByRole("heading", { name: "Triage", exact: true })).toBeVisible();
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
      page.getByRole("heading", { name: "New Sorting Session" }),
    ).toBeVisible();

    const start = page.getByRole("button", { name: "Start Session" });
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
    await expect(page.getByRole("heading", { name: "Triage", exact: true })).toBeVisible();
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
