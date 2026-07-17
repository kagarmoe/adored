// Behavioral e2e for the adaptive collection workspace (Task 4) at
// /collections/[id]. The page derives its shape from the two bounded preview row
// counts: pool-first when loose pool photos exist (items shown second if any),
// items-first when only items exist, else empty. These specs drive the REAL
// rendered DOM as the baseline OWNER (shared storageState) and prove each
// adaptive state by role + accessible name — never brittle text/CSS.
//
// Seeding: seedWorkspaceStates() makes four uniquely-ided collections (one per
// shape) owned by the baseline user, so we do NOT resetDb() (that would wipe the
// baseline user every spec depends on). Specs only navigate + read; they mutate
// nothing, so they cannot interfere with the rest of the suite.
import { test, expect, type Page } from "@playwright/test";
import { closeDb } from "./fixtures/db";
import { seedBaseline, seedWorkspaceStates, type SeededCollectionRef } from "./fixtures/seed";

let poolOnly: SeededCollectionRef;
let itemsOnly: SeededCollectionRef;
let both: SeededCollectionRef;
let empty: SeededCollectionRef;

test.beforeAll(async () => {
  const ownerId = await seedBaseline();
  ({ poolOnly, itemsOnly, both, empty } = await seedWorkspaceStates(ownerId));
});

test.afterAll(async () => {
  await closeDb();
});

test("pool-first: Make items routes to the pool", async ({ page }) => {
  await page.goto(`/collections/${poolOnly.slug}`);

  await expect(page.getByRole("heading", { name: "Photo pool", exact: true })).toBeVisible();

  const makeItems = page.getByRole("link", { name: "Make items", exact: true });
  await expect(makeItems).toHaveAttribute("href", `/collections/${poolOnly.slug}/pool`);

  // Real browser navigation — prove the link actually reaches /pool, not just its href.
  await makeItems.click();
  await expect(page).toHaveURL(new RegExp(`/collections/${poolOnly.slug}/pool$`));
});

test("both: Photo pool renders before Items, with the item preview shown", async ({ page }) => {
  await page.goto(`/collections/${both.slug}`);

  const poolHeading = page.getByRole("heading", { name: "Photo pool", exact: true });
  const itemsHeading = page.getByRole("heading", { name: "Items", exact: true });
  await expect(poolHeading).toBeVisible();
  await expect(itemsHeading).toBeVisible();

  // Pool precedes items in vertical (and document) order.
  const poolBox = await poolHeading.boundingBox();
  const itemsBox = await itemsHeading.boundingBox();
  expect(poolBox).not.toBeNull();
  expect(itemsBox).not.toBeNull();
  expect(poolBox!.y).toBeLessThan(itemsBox!.y);

  // The bounded item preview is still rendered (the seeded item's card links out).
  await expect(page.getByRole("link", { name: "E2E Workspace Clutch", exact: true })).toBeVisible();
  // …and the full items route is offered.
  await expect(page.getByRole("link", { name: "View all items", exact: true })).toHaveAttribute(
    "href",
    `/collections/${both.slug}/items`,
  );
});

test("items-first: View all items routes to the items grid", async ({ page }) => {
  await page.goto(`/collections/${itemsOnly.slug}`);

  await expect(page.getByRole("heading", { name: "Items", exact: true })).toBeVisible();
  // No pool when there are no loose photos.
  await expect(page.getByRole("heading", { name: "Photo pool", exact: true })).toHaveCount(0);

  const viewAll = page.getByRole("link", { name: "View all items", exact: true });
  await expect(viewAll).toHaveAttribute("href", `/collections/${itemsOnly.slug}/items`);

  await viewAll.click();
  await expect(page).toHaveURL(new RegExp(`/collections/${itemsOnly.slug}/items$`));
});

test("empty: offers exactly one add-photos action and no pool/items sections", async ({ page }) => {
  await page.goto(`/collections/${empty.slug}`);

  await expect(page.getByRole("heading", { name: "Photo pool", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Items", exact: true })).toHaveCount(0);

  const addPhotos = page.getByRole("link", { name: "Add photos", exact: true });
  await expect(addPhotos).toHaveCount(1);
  await expect(addPhotos).toHaveAttribute("href", `/collections/${empty.slug}/pool`);
});

// The accessible names of every keyboard-focusable element, in DOM order. With no
// positive tabindex anywhere in the app, DOM order IS the Tab order — so this is
// the focus sequence a keyboard user walks. We assert DOM order rather than
// driving page.keyboard.press("Tab") because the tablet/phone projects run on
// WebKit, where Tab skips links by default (Safari's Full-Keyboard-Access quirk);
// DOM-focusable order is engine-independent and tests the real app concern.
async function focusableNamesInDomOrder(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll(selector))
      .filter((el) => {
        if ((el as HTMLElement).tabIndex < 0) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      })
      .map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim())
      .filter((name) => name.length > 0);
  });
}

// ── Wayfinding (spec 2026-07-16): the breadcrumb back arrow. The pool page sits
// one step below the workspace, so its parent crumb (the collection) is linkable
// and the arrow must render. On tablet the arrow is pointer-only (aria-hidden +
// tabindex=-1 — the parent crumb link is the accessible path), so it is located
// structurally by its attributes + href, never by role.

test("back arrow on a deep page: the tablet pointer shortcut lands on the parent route", async ({
  page,
}) => {
  await page.goto(`/collections/${poolOnly.slug}/pool`);
  await expect(page.getByRole("heading", { name: "Photos", exact: true })).toBeVisible();

  const arrow = page.locator(
    `a[aria-hidden="true"][tabindex="-1"][href="/collections/${poolOnly.slug}"]`,
  );
  await expect(arrow).toBeVisible();
  // The phone collapse link exists only below `sm`; role matching excludes
  // hidden elements, so on tablet it must resolve to nothing.
  await expect(
    page.getByRole("link", { name: "Back to E2E Workspace pool-only" }),
  ).toHaveCount(0);

  // Real navigation: the arrow targets the PARENT crumb (the workspace), not history.
  await arrow.click();
  await expect(page).toHaveURL(new RegExp(`/collections/${poolOnly.slug}$`));
});

test("phone: the trail collapses to a single accessible back link", async ({ page }) => {
  // Match the phone project's viewport (iPhone 13, playwright.config.ts) inside
  // the default project — CI runs one webkit project and never sets PW_VIEWPORT,
  // so an env-gated phone project would never run in CI.
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto(`/collections/${poolOnly.slug}/pool`);
  await expect(page.getByRole("heading", { name: "Photos", exact: true })).toBeVisible();

  const back = page.getByRole("link", { name: "Back to E2E Workspace pool-only" });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute("href", `/collections/${poolOnly.slug}`);
  // The full trail is hidden below `sm` — the collapse leaves exactly this one
  // link (the "Collections" root crumb is the sentinel for the rest of the trail;
  // the header home link is named "Adored home", so no collision).
  await expect(page.getByRole("link", { name: "Collections", exact: true })).toHaveCount(0);

  await back.click();
  await expect(page).toHaveURL(new RegExp(`/collections/${poolOnly.slug}$`));
});

test("keyboard traversal reaches header → primary section → secondary actions → owner utilities in order", async ({
  page,
}) => {
  // Pool-first, owned by the baseline user, so all four zones are present:
  // the top breadcrumb + Build/Sort/Decide chips (header/nav), Make items (primary),
  // Add more photos (secondary), and Collection settings (owner utilities).
  await page.goto(`/collections/${poolOnly.slug}`);
  await expect(page.getByRole("heading", { name: "Photo pool", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Collection settings", exact: true })).toBeVisible();

  const order = await focusableNamesInDomOrder(page);
  const seen = JSON.stringify(order); // surfaced in any failure message below
  const idx = (label: string) => order.indexOf(label);

  // Each zone's representative focusable is reached, and strictly after the prior.
  expect(idx("Collections"), seen).toBeGreaterThanOrEqual(0); // header: breadcrumb back-nav
  // Build/Sort/Decide mode chips are navigation — after the breadcrumb, before the primary action.
  expect(idx("Decide"), seen).toBeGreaterThan(idx("Collections"));
  expect(idx("Make items"), seen).toBeGreaterThan(idx("Decide")); // primary section
  expect(idx("Add more photos"), seen).toBeGreaterThan(idx("Make items")); // secondary actions
  expect(idx("Collection settings"), seen).toBeGreaterThan(idx("Add more photos")); // owner utilities
});
