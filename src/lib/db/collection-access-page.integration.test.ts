// Integration test for the PAGE owner-gate requireCollectionOwnerPage (purses-yqw).
// Un-mocked DB seam: real repos + real Postgres. Mocks ONLY next/navigation's
// redirect (so we can observe the redirect target without an actual Next runtime)
// and getDb -> the test db. This is the REAL proof of the yqw deliverable — the
// edit-page unit test only mocks the guard, so it cannot prove the guard's logic.
// Gated: RUN_DB_TESTS=1.
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedUserRow } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

// redirect() in Next throws to halt rendering; mirror that so callers short-circuit.
const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { requireCollectionOwnerPage } from "@/lib/collection-access";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Minimal collection row owned by ownerId. Returns {collectionId, slug}. */
async function seedCollection(ownerId: string, slug: string): Promise<{ collectionId: string; slug: string }> {
  const { db } = getTestDb();
  const collectionId = generateId("col");
  await db.execute(sql`
    INSERT INTO collections (id, owner_id, name, slug, status, created_at, updated_at)
    VALUES (${collectionId}, ${ownerId}, 'Owner Page Test', ${slug}, 'active', now(), now())
  `);
  return { collectionId, slug };
}

async function addCurator(collectionId: string, userId: string): Promise<void> {
  const { db } = getTestDb();
  await new MembershipRepository(db).create({
    collectionId,
    userId,
    role: "curator",
  });
}

describeDb("requireCollectionOwnerPage — page owner-gate (purses-yqw)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });
  afterAll(async () => { await closeDb(); });

  it("returns the collection for the OWNER (no redirect)", async () => {
    const { db } = getTestDb();
    const { collectionId } = await seedCollection(ownerId, "owner-ok");
    const result = await requireCollectionOwnerPage(db, "owner-ok", ownerId);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result.id).toBe(collectionId);
    expect(result.ownerId).toBe(ownerId);
  });

  it("redirects a non-owner CURATOR to the collection detail page (by slug)", async () => {
    const { db } = getTestDb();
    const { collectionId } = await seedCollection(ownerId, "curator-blocked");
    const curatorId = await seedUserRow("page-curator");
    await addCurator(collectionId, curatorId);

    // The curator HAS access (member) but is NOT the owner → redirect to the detail page.
    await expect(requireCollectionOwnerPage(db, "curator-blocked", curatorId)).rejects.toThrow(
      "NEXT_REDIRECT:/collections/curator-blocked",
    );
    expect(mockRedirect).toHaveBeenCalledWith("/collections/curator-blocked");
  });

  it("redirects when the collection is absent (to /collections)", async () => {
    const { db } = getTestDb();
    // requireCollectionAccess redirects to /collections for an unresolvable id.
    await expect(requireCollectionOwnerPage(db, "col_does_not_exist", ownerId)).rejects.toThrow(
      "NEXT_REDIRECT:/collections",
    );
    expect(mockRedirect).toHaveBeenCalledWith("/collections");
  });

  it("redirects a true non-member to /collections (no access, never reaches the owner check)", async () => {
    const { db } = getTestDb();
    await seedCollection(ownerId, "stranger-blocked");
    const strangerId = await seedUserRow("page-stranger");

    // A non-member has no access at all → requireCollectionAccess redirects to /collections
    // (the owner check is never reached).
    await expect(requireCollectionOwnerPage(db, "stranger-blocked", strangerId)).rejects.toThrow(
      "NEXT_REDIRECT:/collections",
    );
    expect(mockRedirect).toHaveBeenCalledWith("/collections");
  });
});
