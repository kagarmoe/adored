// Un-mocked purge proof: real POST /api/items/[id]/purge route -> ItemPurgeService
// -> real repos -> ephemeral Postgres. Mocks ONLY the external boundaries: auth
// (so we can drive owner / member / non-member) and @vercel/blob's `del` (so the
// blob store isn't actually hit — we assert it WAS called with the right keys).
//
// The load-bearing HARD-delete proof is `findByIdIncludingDeleted` returning null
// after purge: `findById` filters deletedAt, so a null from it is non-distinguishing
// (a mere soft-delete also makes it null). Only the including-deleted lookup proves
// the row is physically gone.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";

const { mockGetSession, mockBlobDel } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockBlobDel: vi.fn(),
}));
// Flat-replace BOTH auth exports from one spy (spread form pulls in nodemailer).
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  requireAuth: async () => {
    const s = await mockGetSession();
    if (!s?.user) throw new Error("Unauthorized");
    return s.user;
  },
}));
vi.mock("@vercel/blob", () => ({ del: mockBlobDel }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { POST as purge } from "@/app/api/items/[id]/purge/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function purgeReq(body?: unknown) {
  return new Request("http://localhost/api/items/x/purge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** A real http blob key (purged) and a non-http one (skipped by the del filter). */
const HTTP_KEY_A = "https://blob.example/a.jpg";
const HTTP_KEY_B = "https://blob.example/b-soft.jpg";
const NON_HTTP_KEY = "local-key-c";

describeDb("POST /api/items/[id]/purge (route -> service -> DB) — purses-u3p", () => {
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
      canManageCollection: false, canInviteMembers: false, canAddItems: true,
      canEditMetadata: true, canAddPhotos: true, canDeletePhotos: true,
      canSort: true, canViewOutputs: true,
    });
    return memberId;
  }

  /** Seed an item with: 2 active http photos, 1 soft-deleted http photo, 1
   *  non-http photo, and 1 owner preference row. Returns the item id. */
  async function seedItemWithChildren(): Promise<string> {
    const { db } = getTestDb();
    const item = await new ItemRepository(db).create({ collectionId });
    const photoRepo = new PhotoRepository(db);
    await photoRepo.create({
      itemId: item.id, collectionId, blobKey: HTTP_KEY_A, filename: "a.jpg",
      mimeType: "image/jpeg", fileSize: 1, uploadedBy: ownerId, isHero: true,
    });
    await photoRepo.create({
      itemId: item.id, collectionId, blobKey: NON_HTTP_KEY, filename: "c.jpg",
      mimeType: "image/jpeg", fileSize: 1, uploadedBy: ownerId, isHero: false,
    });
    const soft = await photoRepo.create({
      itemId: item.id, collectionId, blobKey: HTTP_KEY_B, filename: "b.jpg",
      mimeType: "image/jpeg", fileSize: 1, uploadedBy: ownerId, isHero: false,
    });
    await photoRepo.softDelete(soft.id); // soft-deleted but its blob must STILL be purged
    await new CollectionPreferenceItemRepository(db).create({
      collectionId, curatorId: ownerId, itemId: item.id,
      score: 0.5, confidence: 1, rankBucket: "medium", comparisonCount: 0,
    });
    return item.id;
  }

  async function photoRowCount(itemId: string): Promise<number> {
    const { db } = getTestDb();
    const rows = await db.execute(
      sql`SELECT count(*)::int AS n FROM photos WHERE item_id = ${itemId}`,
    );
    return Number((rows as unknown as { n: number }[])[0].n);
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
    mockBlobDel.mockResolvedValue(undefined);
    ownerId = await seedBaseline();
    const { db } = getTestDb();
    collectionId = generateId("col");
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'Purge test', 'active', now(), now())
    `);
  });

  afterAll(async () => { await closeDb(); });

  it("(a) owner purge hard-deletes the item, its photos (incl. soft-deleted) and preferences, and dels http blobs", async () => {
    const { db } = getTestDb();
    const itemId = await seedItemWithChildren();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await purge(purgeReq({ confirm: "PURGE" }) as any, { params: { id: itemId } });
    expect(res.status).toBe(200);

    // HARD-delete proof: gone even when NOT filtering deletedAt.
    expect(await new ItemRepository(db).findByIdIncludingDeleted(itemId)).toBeNull();
    expect(await photoRowCount(itemId)).toBe(0);
    expect(await prefRowCount(itemId)).toBe(0);

    // Only the two http keys are del'd (the non-http one is skipped); the
    // soft-deleted photo's blob IS included.
    const delledKeys = mockBlobDel.mock.calls.map((c) => c[0]).sort();
    expect(delledKeys).toEqual([HTTP_KEY_A, HTTP_KEY_B].sort());
    expect(delledKeys).not.toContain(NON_HTTP_KEY);
  });

  it("(b) 409 when the item is in a sort result; nothing is deleted", async () => {
    const { db } = getTestDb();
    const itemId = await seedItemWithChildren();
    const result = await new SortResultRepository(db).create({
      collectionId, curatorId: ownerId, name: "R", status: "draft",
    });
    await new SortResultItemRepository(db).create({
      sortResultId: result.id, itemId, computedRank: 1, computedBucket: "top",
    });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await purge(purgeReq({ confirm: "PURGE" }) as any, { params: { id: itemId } });
    expect(res.status).toBe(409);

    // Everything survives.
    expect(await new ItemRepository(db).findByIdIncludingDeleted(itemId)).not.toBeNull();
    expect(await photoRowCount(itemId)).toBe(3);
    expect(await prefRowCount(itemId)).toBe(1);
    expect(mockBlobDel).not.toHaveBeenCalled();
  });

  it("(c) 403 for a non-owner member; the item survives", async () => {
    const { db } = getTestDb();
    const itemId = await seedItemWithChildren();
    const memberId = await addMember();
    mockGetSession.mockResolvedValue({ user: { id: memberId } });

    const res = await purge(purgeReq({ confirm: "PURGE" }) as any, { params: { id: itemId } });
    expect(res.status).toBe(403);
    expect(await new ItemRepository(db).findByIdIncludingDeleted(itemId)).not.toBeNull();
    expect(mockBlobDel).not.toHaveBeenCalled();
  });

  it("(d) 404 for an absent item id", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await purge(purgeReq({ confirm: "PURGE" }) as any, { params: { id: "item_does_not_exist" } });
    expect(res.status).toBe(404);
  });

  it("(e) 403 (NOT 400) for a non-owner with a malformed body — authz precedes parsing", async () => {
    const { db } = getTestDb();
    const itemId = await seedItemWithChildren();
    const memberId = await addMember();
    mockGetSession.mockResolvedValue({ user: { id: memberId } });

    // Malformed JSON body — a non-owner must still get 403, never a 400 oracle.
    const badReq = new Request("http://localhost/api/items/x/purge", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{ not json",
    });
    const res = await purge(badReq as any, { params: { id: itemId } });
    expect(res.status).toBe(403);
    expect(await new ItemRepository(db).findByIdIncludingDeleted(itemId)).not.toBeNull();
  });

  it("(f) 400 for the owner with a missing confirm; nothing is deleted", async () => {
    const { db } = getTestDb();
    const itemId = await seedItemWithChildren();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await purge(purgeReq({}) as any, { params: { id: itemId } });
    expect(res.status).toBe(400);
    expect(await new ItemRepository(db).findByIdIncludingDeleted(itemId)).not.toBeNull();
    expect(await photoRowCount(itemId)).toBe(3);
    expect(await prefRowCount(itemId)).toBe(1);
    expect(mockBlobDel).not.toHaveBeenCalled();
  });

  it("(g) a blob `del` failure does NOT fail the purge — DB rows still gone, 200 (best-effort)", async () => {
    // The blob store is an external best-effort boundary: the DB delete already
    // committed, so a `del` rejection must be swallowed (Promise.allSettled), not
    // propagated. A rejected del that 500'd the route would leave the item
    // un-purgeable forever — the exact failure this regression pins.
    const { db } = getTestDb();
    const itemId = await seedItemWithChildren();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    mockBlobDel.mockRejectedValue(new Error("blob store unreachable"));

    const res = await purge(purgeReq({ confirm: "PURGE" }) as any, { params: { id: itemId } });
    expect(res.status).toBe(200);

    // The destructive DB work committed despite the blob failure.
    expect(await new ItemRepository(db).findByIdIncludingDeleted(itemId)).toBeNull();
    expect(await photoRowCount(itemId)).toBe(0);
    expect(await prefRowCount(itemId)).toBe(0);

    // del WAS attempted for both http keys (the failure is on the store side).
    const delledKeys = mockBlobDel.mock.calls.map((c) => c[0]).sort();
    expect(delledKeys).toEqual([HTTP_KEY_A, HTTP_KEY_B].sort());
  });
});
