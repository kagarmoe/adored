// Lists and home (spec 2026-10-01 §5), un-mocked except photo bytes: the collections
// grid (search, owner ···, Archive with Undo, Archived, Bring back), the collection home
// as the items grid (one primary + Add photos, search, pills), the phone action bar's
// geometry (viewport-sensitive, checked here in CI at iPhone width), and wayfinding.
import { test, expect, type Page } from "@playwright/test";
import { closeDb, getTestDb } from "./fixtures/db";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import {
  seedBaseline,
  seedJourneyScenario,
  seedNamedCollection,
  seedSortScenario,
  seedWorkspaceStates,
  type SeededCollectionRef,
} from "./fixtures/seed";

const FIXTURE = "e2e/fixtures/sample-images/labeled/sort-images.webp";
const PHONE = { width: 390, height: 664 };

let ownerId: string;
let poolOnly: SeededCollectionRef;
let itemsOnly: SeededCollectionRef;
let startable: SeededCollectionRef;
let shelf: { name: string } & SeededCollectionRef;
let long: { slug: string };
let ranked: { slug: string };
let archivedHome: string;
let pool: SeededCollectionRef;

test.beforeAll(async () => {
  ownerId = await seedBaseline();
  ({ poolOnly, itemsOnly } = await seedWorkspaceStates(ownerId));
  // A second items-only collection, used ONLY by the test that clicks Start sorting
  // (it opens a session, so "Start sorting" never comes back there). Keeps the
  // keyboard-order test on itemsOnly independent of test order and retries.
  ({ itemsOnly: startable } = await seedWorkspaceStates(ownerId));
  const name = `E2E Shelf ${Date.now()}`;
  shelf = { name, ...(await seedNamedCollection(ownerId, name)) };
  long = await seedJourneyScenario(ownerId, 8); // enough cards to scroll on a phone
  pool = await seedPool(ownerId, 12); // enough tiles to scroll on a phone
  const withArchived = await seedJourneyScenario(ownerId, 2);
  await new ItemRepository(getTestDb().db).softDelete(withArchived.itemIds[0]);
  archivedHome = `/collections/${withArchived.slug}?status=archived`;
  ranked = await seedSortScenario(ownerId); // has a finalized ranking, so the chip row carries See your ranking
});

test.afterAll(async () => {
  await closeDb();
});

test.beforeEach(async ({ page }) => {
  for (const pattern of ["**/api/photo-files/**", "**/pool/photos/**/file*"]) {
    await page.route(pattern, (route) => route.fulfill({ path: FIXTURE, contentType: "image/webp" }));
  }
});

const card = (page: Page, name: string) => page.getByRole("link", { name, exact: true });

// A collection with n loose pool photos named "shelf photo 1…n" (the tile's accessible name).
async function seedPool(owner: string, n: number): Promise<SeededCollectionRef> {
  const ref = await seedNamedCollection(owner, `E2E Pool ${Date.now()}`);
  const photos = new PhotoRepository(getTestDb().db);
  for (let i = 1; i <= n; i++) {
    await photos.create({
      itemId: null, collectionId: ref.collectionId, blobKey: "e2e-placeholder",
      filename: `shelf-photo-${i}.jpg`, mimeType: "image/jpeg", fileSize: 1, uploadedBy: owner, isHero: false,
    });
  }
  return ref;
}

test("collections: search, archive with Undo, Archived, Bring back", async ({ page }) => {
  await page.goto("/collections");
  await expect(page).toHaveURL((u) => u.pathname === "/collections");
  await expect(page.getByRole("region", { name: "Next step" }).getByRole("link", { name: "New collection" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search your collections" }).fill(shelf.name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForURL((u) => u.searchParams.get("q") === shelf.name);
  await expect(card(page, shelf.name)).toBeVisible();
  await expect(card(page, "E2E Workspace items-only")).toHaveCount(0);

  // Archive → the list with the Undo notice → Undo brings it straight back.
  await page.getByRole("button", { name: `More for ${shelf.name}` }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.waitForURL((u) => u.searchParams.get("removed") === shelf.collectionId);
  await expect(page.getByText(/^Archived\./)).toBeVisible();
  await expect(card(page, shelf.name)).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForURL((u) => !u.searchParams.has("removed"));
  await expect(card(page, shelf.name)).toBeVisible();

  // Archive again, find it under Archived, Bring back from its ···.
  await page.getByRole("button", { name: `More for ${shelf.name}` }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.waitForURL((u) => u.searchParams.has("removed"));
  await page.getByRole("link", { name: "Archived", exact: true }).click();
  await page.waitForURL((u) => u.searchParams.get("status") === "archived");
  await page.getByRole("button", { name: `More for ${shelf.name}` }).click();
  await page.getByRole("menuitem", { name: "Bring back" }).click();
  // The card leaves this list, so focus lands on the line that says where it went.
  const broughtBack = page.getByRole("status").filter({ hasText: /^Brought back\. It.s under All\.$/ });
  await expect(broughtBack).toBeVisible();
  await expect(broughtBack).toBeFocused();
  await expect(card(page, shelf.name)).toHaveCount(0); // (other runs' archived shelves may remain)
  await page.getByRole("link", { name: "All", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search your collections" }).fill(shelf.name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(card(page, shelf.name)).toBeVisible();
  await card(page, shelf.name).click();
  await expect(page).toHaveURL((u) => u.pathname === `/collections/${shelf.slug}`);
});

test("home: the items grid with Start sorting and Add photos beside it", async ({ page }) => {
  const home = `/collections/${startable.slug}`; // this test opens a sort; nothing else uses it
  await page.goto(home);
  await expect(page).toHaveURL((u) => u.pathname === home);
  await expect(card(page, "E2E Workspace Tote")).toHaveAttribute("href", `${home}/items/1`);

  const bar = page.getByRole("region", { name: "Next step" });
  await expect(bar.getByRole("link", { name: "Add photos" })).toHaveAttribute("href", `${home}/pool`);

  await page.getByRole("searchbox", { name: "Search your items" }).fill("zzz-nothing");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nothing matches “zzz-nothing”" })).toBeVisible();
  await page.getByRole("link", { name: "Archived", exact: true }).click();
  await expect(page).toHaveURL((u) => u.pathname === home && u.searchParams.get("status") === "archived");

  await page.goto(home);
  await bar.getByRole("button", { name: "Start sorting" }).click();
  await page.waitForURL((u) => u.pathname === `${home}/sort`);
});

test("home before items: Make items leads when photos wait", async ({ page }) => {
  // (The empty state's Add photos is pinned by the page unit test; no second e2e for it.)
  await page.goto(`/collections/${poolOnly.slug}`);
  const bar = page.getByRole("region", { name: "Next step" });
  await expect(page.getByRole("region", { name: "Photos waiting" })).toBeVisible();
  await bar.getByRole("link", { name: "Make items" }).click();
  await page.waitForURL((u) => u.pathname === `/collections/${poolOnly.slug}/pool`);
});

test("phone: with a ranking, the link is hidden so a card row stays above the bar", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(`/collections/${ranked.slug}`);
  const bar = page.getByRole("region", { name: "Next step" });
  await expect(bar).toBeVisible();
  await expect(page.getByRole("link", { name: "See your ranking" })).toBeHidden();
  const barBox = (await bar.boundingBox())!;
  const first = (await page.getByRole("list", { name: "Your items" }).getByRole("listitem").first().boundingBox())!;
  expect(first.y + first.height / 2).toBeLessThan(barBox.y);
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.getByRole("link", { name: "See your ranking" })).toBeVisible();
});

test("phone: the bar is pinned to the bottom and never hides the last row", async ({ page }) => {
  // Viewport-sensitive (spec §5), so it runs in CI's tablet project at iPhone 13 width.
  await page.setViewportSize(PHONE);
  const home = `/collections/${long.slug}`;
  await page.goto(home);
  const bar = page.getByRole("region", { name: "Next step" });
  await expect(bar.getByRole("button", { name: "Keep sorting" })).toBeVisible();
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
  const pinned = async () => {
    const box = (await bar.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(PHONE.height);
    return box;
  };
  const topBar = await pinned();
  const cards = page.getByRole("list", { name: "Your items" }).getByRole("listitem");

  // Above the fold: at least half of the first card is visible on load, clear of the bar (no scroll).
  const firstOnLoad = (await cards.first().boundingBox())!;
  expect(firstOnLoad.y).toBeGreaterThanOrEqual(0);
  expect(firstOnLoad.y + firstOnLoad.height / 2).toBeLessThan(topBar.y);
  // Keyboard focus scrolls a bottom-row card clear of the bar: the scroll padding matches the reserve.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom)).toBe("144px");

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const barBox = await pinned();
  const footerText = page.getByText("Find the things you love");
  await expect(cards.last()).toBeInViewport();
  await expect(footerText).toBeInViewport();
  const lastCard = (await cards.last().boundingBox())!;
  expect(lastCard.y + lastCard.height).toBeLessThanOrEqual(barBox.y);
  const footer = (await footerText.boundingBox())!;
  expect(footer.y + footer.height).toBeLessThanOrEqual(barBox.y);

  // Short (browser zoom): the bar goes static and the scroll padding is released with it.
  await page.setViewportSize({ width: PHONE.width, height: 480 });
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe("static");
  expect(["0px", "auto"]).toContain(
    await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom),
  );

  // The same node is an inline row above the grid on tablet.
  await page.setViewportSize({ width: 1080, height: 810 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const inline = (await bar.boundingBox())!;
  const firstCard = (await cards.first().boundingBox())!;
  expect(inline.y + inline.height).toBeLessThan(firstCard.y);
});

// The accessible names of every keyboard-focusable element, in DOM order (= Tab order:
// no positive tabindex anywhere). WebKit's Tab skips links, so DOM order is asserted.
async function focusableNamesInDomOrder(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll(selector))
      .filter((el) => {
        if ((el as HTMLElement).tabIndex < 0) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim())
      .filter((name) => name.length > 0);
  });
}

test("pool: the selection bar is pinned at phone and tablet widths and never hides the last tile or the footer", async ({ page }) => {
  // Viewport-sensitive: unlike ActionBar this bar stays fixed on tablet, so both sizes run here in CI.
  for (const size of [PHONE, { width: 1080, height: 810 }]) {
    await page.setViewportSize(size);
    await page.goto(`/collections/${pool.slug}/pool`);
    await page.getByRole("button", { name: "shelf photo 1", exact: true }).click();
    await page.getByRole("button", { name: "shelf photo 2", exact: true }).click();
    const bar = page.getByRole("region", { name: "Grouping actions" });
    await expect(bar).toBeVisible();
    expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
    const pinned = async () => {
      const box = (await bar.boundingBox())!;
      expect(Math.round(box.y + box.height)).toBe(size.height);
      return box;
    };
    // A focused tile scrolls clear of the bar: the scroll padding matches the reserve.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom)).toBe(
      size === PHONE ? "224px" : "144px",
    );

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const barBox = await pinned();
    const last = page.getByRole("button", { name: "shelf photo 12", exact: true });
    await expect(last).toBeInViewport();
    expect(((await last.boundingBox())!.y + (await last.boundingBox())!.height)).toBeLessThanOrEqual(barBox.y);
    const footer = (await page.getByText("Find the things you love").boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(barBox.y);

    // The Move to… chooser grows the bar upward; the bar stays on the bottom edge.
    await bar.getByRole("button", { name: "Move to…" }).click();
    await expect(bar.getByRole("button", { name: "New item" })).toBeVisible();
    await pinned();
    await page.keyboard.press("Escape");
  }

  // Short (browser zoom): the bar goes static and nothing is reserved.
  await page.setViewportSize({ width: PHONE.width, height: 480 });
  const bar = page.getByRole("region", { name: "Grouping actions" });
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe("static");
  expect(["0px", "auto"]).toContain(
    await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom),
  );
});

test("keyboard order on the home: trail → menu → chips → primary → pill → search → cards", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "tablet", "DOM order is viewport-independent; the phone trail collapses");
  await page.goto(`/collections/${itemsOnly.slug}`); // never sorted: no other test opens a sort here
  await expect(card(page, "E2E Workspace Tote")).toBeVisible();
  const order = await focusableNamesInDomOrder(page);
  const seen = JSON.stringify(order);
  const idx = (label: string) => order.indexOf(label);
  expect(idx("Collections"), seen).toBeGreaterThanOrEqual(0);
  expect(idx("More for E2E Workspace items-only"), seen).toBeGreaterThan(idx("Collections"));
  expect(idx("Decide"), seen).toBeGreaterThan(idx("More for E2E Workspace items-only"));
  expect(idx("Start sorting"), seen).toBeGreaterThan(idx("Decide"));
  expect(idx("Add photos"), seen).toBeGreaterThan(idx("Start sorting"));
  expect(idx("Search"), seen).toBeGreaterThan(idx("Add photos"));
  expect(idx("E2E Workspace Tote"), seen).toBeGreaterThan(idx("Search"));
});

// ── Wayfinding (spec 2026-07-16): the breadcrumb back arrow. The pool page sits
// one step below the workspace, so its parent crumb (the collection) is linkable
// and the arrow must render. On tablet the arrow is pointer-only (aria-hidden +
// tabindex=-1 — the parent crumb link is the accessible path), so it is located
// structurally by its attributes + href, never by role.

test("back arrow on a deep page: the tablet pointer shortcut lands on the parent route", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "tablet", "the pointer-only arrow is a tablet affordance");
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

test("phone: an archived card's Bring back lines up with the name and fits the card, idle and busy", async ({ page }) => {
  // Viewport-sensitive: a 390px two-column card is the narrowest column the pill must fit.
  await page.setViewportSize(PHONE);
  await page.goto(archivedHome);
  const tile = page.getByRole("list", { name: "Your items" }).getByRole("listitem").first();
  const name = (await tile.getByRole("heading").boundingBox())!;
  const cardBox = (await tile.boundingBox())!;
  const fits = async (label: RegExp) => {
    const pill = tile.getByRole("button", { name: label });
    const box = (await pill.boundingBox())!;
    expect(Math.abs(box.x - name.x)).toBeLessThanOrEqual(1); // the pill's edge is the name's edge
    expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width - 12); // inside p-3
    expect(box.height).toBeGreaterThanOrEqual(44);
    // The label never spills sideways or downward, and stays on one line.
    expect(
      await pill.evaluate((el) => {
        const line = document.createRange();
        line.selectNodeContents(el);
        return el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight && line.getClientRects().length === 1;
      }),
    ).toBe(true);
  };
  await fits(/^Bring back$/);
  // Hold the restore open so the busy label can be measured.
  await page.route("**/api/items/*/restore", () => {});
  await tile.getByRole("button", { name: /^Bring back$/ }).click();
  await fits(/^One moment…$/);
});
