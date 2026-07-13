// Un-mocked remove-from-sorts proof: real POST /api/items/[id]/remove-from-sorts
// route -> SortResultService.removeItemFromDraftResults -> real repos -> ephemeral
// Postgres. Mocks ONLY @/lib/auth (so we can drive owner / member / non-member).
// No blob mock needed: this op never touches photos/blobs.
//
// The load-bearing proofs: the DRAFT result-item is physically gone, the FINALIZED
// result-item SURVIVES, and the item's preference rows are untouched — asserted by
// direct row counts, not by the response body alone.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
// Flat-replace BOTH auth exports from one spy (spread form pulls in nodemailer).
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  requireAuth: async () => {
    const s = await mockGetSession();
    if (!s?.user) throw new Error("Unauthorized");
    return s.user;
  },
}));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { POST as removeFromSorts } from "@/app/api/items/[id]/remove-from-sorts/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function removeReq() {
  return new Request("http://localhost/api/items/x/remove-from-sorts", {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
}

describeDb("POST /api/items/[id]/remove-from-sorts (route -> service -> DB) — purses-u3p", () => {
  let ownerId: string;
  let collectionId: string;

  /** Add a distinct curator member (not the owner) to the collection. */
  async function addMember(): Promise<string> {
    const { db } = getTestDb();
    const memberId = generateId("user");
    await db.insert((await import("@/lib/db/schema")).user).values({
      id: memberId, email: `m-${memberId}@adored.test`, name: "Member",
    });
    await new MembershipRepository(db).create({
      collectionId, userId: memberId, role: "curator",
    });
    return memberId;
  }

  /** Seed an item + one owner preference row. Returns the item id. */
  async function seedItemWithPreference(): Promise<string> {
    const { db } = getTestDb();
    const item = await new ItemRepository(db).create({ collectionId });
    await new CollectionPreferenceItemRepository(db).create({
      collectionId, curatorId: ownerId, itemId: item.id,
      score: 0.5, confidence: 1, rankBucket: "medium", comparisonCount: 0,
    });
    return item.id;
  }

  /** Place the item in a result of the given status; returns the result-item id. */
  async function placeInResult(
    itemId: string,
    status: "draft" | "finalized",
  ): Promise<string> {
    const { db } = getTestDb();
    const result = await new SortResultRepository(db).create({
      collectionId, curatorId: ownerId, name: `R-${status}`, status,
    });
    const ri = await new SortResultItemRepository(db).create({
      sortResultId: result.id, itemId, computedRank: 1, computedBucket: "top",
    });
    return ri.id;
  }

  async function resultItemExists(id: string): Promise<boolean> {
    const { db } = getTestDb();
    const rows = await db.execute(
      sql`SELECT count(*)::int AS n FROM sort_result_items WHERE id = ${id}`,
    );
    return Number((rows as unknown as { n: number }[])[0].n) > 0;
  }

  async function prefRowCount(itemId: string): Promise<number> {
    const { db } = getTestDb();
    const rows = await db.execute(
      sql`SELECT count(*)::int AS n FROM preferences WHERE item_id = ${itemId}`,
    );
    return Number((rows as unknown as { n: number }[])[0].n);
  }

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
    const { db } = getTestDb();
    collectionId = generateId("col");
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'Remove test', 'active', now(), now())
    `);
  });

  afterAll(async () => { await closeDb(); });

  it("(a) item in BOTH draft and finalized: removes only the draft result-item, finalized survives, prefs untouched", async () => {
    const itemId = await seedItemWithPreference();
    const draftRi = await placeInResult(itemId, "draft");
    const finalizedRi = await placeInResult(itemId, "finalized");
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await removeFromSorts(removeReq() as any, { params: Promise.resolve({ id: itemId }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: 1, remainingInFinalized: 1 });

    expect(await resultItemExists(draftRi)).toBe(false); // draft GONE
    expect(await resultItemExists(finalizedRi)).toBe(true); // finalized SURVIVES
    expect(await prefRowCount(itemId)).toBe(1); // preferences untouched
  });

  it("(b) item in draft-only results: removed>=1, remainingInFinalized 0", async () => {
    const itemId = await seedItemWithPreference();
    const draftRi1 = await placeInResult(itemId, "draft");
    const draftRi2 = await placeInResult(itemId, "draft");
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await removeFromSorts(removeReq() as any, { params: Promise.resolve({ id: itemId }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { removed: number; remainingInFinalized: number };
    expect(body.removed).toBeGreaterThanOrEqual(1);
    expect(body.removed).toBe(2);
    expect(body.remainingInFinalized).toBe(0);

    expect(await resultItemExists(draftRi1)).toBe(false);
    expect(await resultItemExists(draftRi2)).toBe(false);
  });

  it("(c) 403 for a non-owner member; nothing is removed", async () => {
    const itemId = await seedItemWithPreference();
    const draftRi = await placeInResult(itemId, "draft");
    const memberId = await addMember();
    mockGetSession.mockResolvedValue({ user: { id: memberId } });

    const res = await removeFromSorts(removeReq() as any, { params: Promise.resolve({ id: itemId }) });
    expect(res.status).toBe(403);
    expect(await resultItemExists(draftRi)).toBe(true); // nothing removed
  });

  it("(d) 404 for an absent item id", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await removeFromSorts(removeReq() as any, { params: Promise.resolve({ id: "item_does_not_exist" }) });
    expect(res.status).toBe(404);
  });
});
