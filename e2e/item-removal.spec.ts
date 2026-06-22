import { test, expect, type APIRequestContext } from "@playwright/test";
import { eq } from "drizzle-orm";
import { sortResultItemsTable, itemsTable } from "@/lib/db/schema";
import { getTestDb, closeDb } from "./fixtures/db";
import { seedRemovalScenario } from "./fixtures/seed";
import { apiContextFor } from "./fixtures/api-auth";

// API-level e2e for the ENTIRE item-removal workflow (purses-u3p). There is no
// UI for purge / remove-from-sorts, so these drive the REAL routes against the
// prod build + ephemeral Postgres through authenticated APIRequestContexts —
// one for the owner, one for a non-owner (the harness ships a single shared
// storageState; the non-owner context is net-new, required for the authz case).
//
// Seeding: each test seeds a fresh, uniquely-ided scenario via
// seedRemovalScenario(). We deliberately DO NOT resetDb() — that would wipe the
// baseline user the shared storageState (and every other spec) depends on. Fresh
// ids per seed mean no collision with the baseline data.

const BASE = "/api/items";

/** The item-gone signal. GET /api/items/[id] returns the item (200) while it
 *  exists; after a hard purge `findById` is null and the route surfaces a
 *  non-2xx error (500 "Item not found" — the route maps the controller's throw
 *  to 500, not 404). So "gone" == "no longer 200 with this item's id". */
async function itemIsGone(ctx: APIRequestContext, itemId: string): Promise<boolean> {
  const res = await ctx.get(`${BASE}/${itemId}`);
  if (res.status() === 200) {
    const body = await res.json();
    return body?.id !== itemId;
  }
  return true; // any non-200 means the item no longer resolves
}

async function itemIsPresent(ctx: APIRequestContext, itemId: string): Promise<boolean> {
  const res = await ctx.get(`${BASE}/${itemId}`);
  if (res.status() !== 200) return false;
  const body = await res.json();
  return body?.id === itemId;
}

/** Does the item row physically exist (DB), regardless of who may read it via the
 *  API. Used to prove survival from a context that cannot GET the item — e.g. a
 *  non-member, who is now correctly 403'd on GET /api/items/[id] (pv9 IDOR fix). */
async function itemRowExists(itemId: string): Promise<boolean> {
  const { db } = getTestDb();
  const rows = await db
    .select({ id: itemsTable.id })
    .from(itemsTable)
    .where(eq(itemsTable.id, itemId));
  return rows.length > 0;
}

/** Count this item's sort_result_item rows directly (DB), to prove survival. */
async function resultItemRowCount(itemId: string): Promise<number> {
  const { db } = getTestDb();
  const rows = await db
    .select({ id: sortResultItemsTable.id })
    .from(sortResultItemsTable)
    .where(eq(sortResultItemsTable.itemId, itemId));
  return rows.length;
}

test.describe("item removal workflow (purge + remove-from-sorts) — purses-u3p", () => {
  test.afterAll(async () => {
    await closeDb();
  });

  test("(1) un-block → purge chain: 409 → remove-from-sorts → purge → gone", async ({ playwright }) => {
    const scenario = await seedRemovalScenario();
    // Draft-only variant: drop the finalized membership so the chain can reach
    // remainingInFinalized:0 and the final purge can succeed.
    {
      const { db } = getTestDb();
      await db
        .delete(sortResultItemsTable)
        .where(eq(sortResultItemsTable.id, scenario.finalizedResultItemId));
    }

    const owner = await apiContextFor(playwright, scenario.owner);
    try {
      // Purge is blocked while the item is still in the (draft) result.
      const blocked = await owner.post(`${BASE}/${scenario.itemId}/purge`, {
        data: { confirm: "PURGE" },
      });
      expect(blocked.status(), "purge must be 409 while item is in a result").toBe(409);
      expect(await itemIsPresent(owner, scenario.itemId)).toBe(true);

      // Detach from all draft results — clears the block.
      const detach = await owner.post(`${BASE}/${scenario.itemId}/remove-from-sorts`);
      expect(detach.status()).toBe(200);
      const detachBody = await detach.json();
      expect(detachBody.removed).toBeGreaterThanOrEqual(1);
      expect(detachBody.remainingInFinalized).toBe(0);

      // Now the purge succeeds.
      const purged = await owner.post(`${BASE}/${scenario.itemId}/purge`, {
        data: { confirm: "PURGE" },
      });
      expect(purged.status()).toBe(200);

      // The item is gone (hard-deleted) and no result-item rows remain.
      expect(await itemIsGone(owner, scenario.itemId)).toBe(true);
      expect(await resultItemRowCount(scenario.itemId)).toBe(0);
    } finally {
      await owner.dispose();
    }
  });

  test("(2) finalized dead-end: remove-from-sorts leaves 1 finalized, purge stays 409", async ({ playwright }) => {
    const scenario = await seedRemovalScenario();

    const owner = await apiContextFor(playwright, scenario.owner);
    try {
      // Detaches the DRAFT membership only; the finalized one survives.
      const detach = await owner.post(`${BASE}/${scenario.itemId}/remove-from-sorts`);
      expect(detach.status()).toBe(200);
      const detachBody = await detach.json();
      expect(detachBody.removed).toBe(1);
      expect(detachBody.remainingInFinalized).toBe(1);

      // Purge is still blocked — a finalized membership is a hard dead-end.
      const blocked = await owner.post(`${BASE}/${scenario.itemId}/purge`, {
        data: { confirm: "PURGE" },
      });
      expect(blocked.status()).toBe(409);

      // Item + the surviving finalized result-item are intact.
      expect(await itemIsPresent(owner, scenario.itemId)).toBe(true);
      expect(await resultItemRowCount(scenario.itemId)).toBe(1);
    } finally {
      await owner.dispose();
    }
  });

  test("(3) authz: a non-owner is 403 on BOTH ops; item + results survive", async ({ playwright }) => {
    const scenario = await seedRemovalScenario();

    const nonOwner = await apiContextFor(playwright, scenario.nonOwner);
    try {
      const purgeRes = await nonOwner.post(`${BASE}/${scenario.itemId}/purge`, {
        data: { confirm: "PURGE" },
      });
      expect(purgeRes.status(), "non-owner purge must be 403").toBe(403);

      const removeRes = await nonOwner.post(`${BASE}/${scenario.itemId}/remove-from-sorts`);
      expect(removeRes.status(), "non-owner remove-from-sorts must be 403").toBe(403);

      // Nothing was touched: the item and BOTH result-items survive. The non-owner
      // is a non-member, so it can no longer GET the item via the API (pv9 IDOR fix
      // returns 403) — prove survival straight from the DB instead.
      expect(await itemRowExists(scenario.itemId)).toBe(true);
      expect(await resultItemRowCount(scenario.itemId)).toBe(2);
    } finally {
      await nonOwner.dispose();
    }
  });
});
