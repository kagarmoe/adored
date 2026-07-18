// Regression spec for purses-a45s: SharePanel promises "no account, no signing
// in", so an ANONYMOUS visitor with the link must reach the read-only page —
// the proxy matcher must not 307 /shared-results/[token] to /login. This is the
// stranger-hits-the-real-route authz boundary for the share token.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedSortScenario } from "./fixtures/seed";
import { getTestDb } from "./fixtures/db";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";

// The whole file runs signed OUT — no cookies, no storage.
test.use({ storageState: { cookies: [], origins: [] } });

const SHARE_TOKEN = "tok_e2e_shared_results_anon";

test.beforeAll(async () => {
  const ownerId = await seedBaseline();
  const { collectionId, itemIds } = await seedSortScenario(ownerId);
  const { db } = getTestDb();
  const finalized = await new SortResultRepository(db).create({
    collectionId,
    curatorId: ownerId,
    name: "Shared ranking",
    status: "finalized",
  });
  await new SortResultItemRepository(db).create({
    sortResultId: finalized.id,
    itemId: itemIds[0],
    computedRank: 1,
    computedBucket: "high",
  });
  await new SortResultShareRepository(db).create({
    sortResultId: finalized.id,
    shareToken: SHARE_TOKEN,
  });
});

test("a stranger with the link sees the read-only result, not a login redirect", async ({ page }) => {
  await page.goto(`/shared-results/${SHARE_TOKEN}`);
  await expect(page).toHaveURL(new RegExp(`/shared-results/${SHARE_TOKEN}$`));
  await expect(page.getByText("Shared read-only result")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shared ranking" })).toBeVisible();
});

// purses-21x5.1: the shared page's item photo must actually resolve for an
// anonymous viewer — it now points at the new token-scoped
// /api/shared-results/[token]/photos/[photoId] route instead of the
// session-gated /api/photo-files one, which would 401 every image here.
//
// HONESTY NOTE: this harness has no blob emulator — seeded photos carry a bare
// placeholder blobKey ("e2e-placeholder", see fixtures/seed.ts), not a real
// blob object, so servePhotoFile's real fetch-from-Blob path can't return real
// bytes here. sort-images.spec.ts hits the identical wall for the session-gated
// route and resolves it by fulfilling the request with a local fixture image
// via page.route; this test follows that SAME established pattern for the new
// route (the only proven way this repo serves real-looking image bytes in the
// Playwright harness). What's actually verified: the shared page's img tag now
// requests the NEW token-scoped route (not the old session-gated one, which an
// anonymous viewer can never authenticate against) and that request resolves
// 200 in-page — the real assertion this ticket cares about.
test("an anonymous viewer's item image resolves via the token-scoped photo route", async ({ page }) => {
  await page.route(`**/api/shared-results/${SHARE_TOKEN}/photos/**`, (route) =>
    route.fulfill({ path: "e2e/fixtures/sample-images/labeled/sort-images.webp", contentType: "image/webp" }),
  );

  const photoResponse = page.waitForResponse(
    (r) => new URL(r.url()).pathname.includes(`/api/shared-results/${SHARE_TOKEN}/photos/`),
  );
  await page.goto(`/shared-results/${SHARE_TOKEN}`);

  const res = await photoResponse;
  expect(res.status()).toBe(200);
  await expect(page.getByRole("img").first()).toBeVisible();
});
