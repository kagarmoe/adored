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
