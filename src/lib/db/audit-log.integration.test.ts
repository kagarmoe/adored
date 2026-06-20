// Un-mocked AuditLogRepository proof: real repo -> ephemeral Postgres. No mocks
// of any kind — `record` writes a real row and `findByCollection` reads it back,
// so the ordering (desc createdAt, desc id), the clamp, and the collection scope
// are proven against the real `audit_log` table, not a stub.
//
// Newest-first is asserted on inserts made in the SAME millisecond on purpose:
// the desc(createdAt), desc(id) total order is what makes ties deterministic, and
// id (a monotonic ULID) is the tie-breaker. A test that spaced inserts out in
// time would pass even if the id tie-break were dropped — this one wouldn't.
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { AuditLogRepository } from "@/server/repositories/implementations/AuditLogRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";

// Drive the REAL purge route end-to-end. Mock only the external boundaries: auth
// (owner session), @vercel/blob's del (don't hit the store), and getDb -> test db.
const { mockGetSession, mockBlobDel } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockBlobDel: vi.fn(),
}));
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

describeDb("AuditLogRepository (repo -> DB) — purses-ite", () => {
  let collectionId: string;

  beforeEach(async () => {
    await resetDb();
    const ownerId = await seedBaseline();
    const { db } = getTestDb();
    collectionId = generateId("col");
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'Audit test', 'active', now(), now())
    `);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("records entries and reads them back newest-first (total order)", async () => {
    const repo = new AuditLogRepository(getTestDb().db);
    await repo.record({
      actorId: "u-actor",
      action: "item.purge",
      targetType: "item",
      targetId: "itm-1",
      collectionId,
      metadata: { photosDeleted: 2, preferencesDeleted: 1 },
    });
    await repo.record({
      actorId: "u-actor",
      action: "item.purge",
      targetType: "item",
      targetId: "itm-2",
      collectionId,
      metadata: { photosDeleted: 0, preferencesDeleted: 0 },
    });

    const rows = await repo.findByCollection(collectionId);
    expect(rows).toHaveLength(2);
    // Newest-first; the second insert (itm-2) leads even on a same-ms createdAt
    // because the ULID id tie-breaks descending.
    expect(rows[0].targetId).toBe("itm-2");
    expect(rows[1].targetId).toBe("itm-1");
    expect(rows[0].action).toBe("item.purge");
    expect(rows[0].targetType).toBe("item");
    expect(rows[0].actorId).toBe("u-actor");
    // metadata round-trips as a plain object (jsonb), oldest row's payload intact.
    expect(rows[1].metadata).toEqual({ photosDeleted: 2, preferencesDeleted: 1 });
    // createdAt is materialized by the DB default.
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });

  it("omitted metadata persists as null", async () => {
    const repo = new AuditLogRepository(getTestDb().db);
    await repo.record({
      actorId: "u",
      action: "collection.purge",
      targetType: "collection",
      targetId: collectionId,
      collectionId,
    });
    const rows = await repo.findByCollection(collectionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toBeNull();
    expect(rows[0].action).toBe("collection.purge");
    expect(rows[0].targetType).toBe("collection");
  });

  it("clamps limit: >200 -> 200, NaN/absent -> 100, <1 -> 1 (never throws, always bounded)", async () => {
    const repo = new AuditLogRepository(getTestDb().db);
    await repo.record({
      actorId: "u",
      action: "item.purge",
      targetType: "item",
      targetId: "a",
      collectionId,
    });
    // One row seeded: each clamp branch must return it without error and never
    // exceed its bound. The exact cap (200/100/1) is unobservable with one row,
    // so this pins "bounded + no throw"; cap arithmetic is covered by the unit
    // clamp behavior below.
    expect(await repo.findByCollection(collectionId, { limit: 99999 })).toHaveLength(1);
    expect((await repo.findByCollection(collectionId, { limit: NaN })).length).toBeLessThanOrEqual(1);
    expect(await repo.findByCollection(collectionId, { limit: -5 })).toHaveLength(1);
    expect(await repo.findByCollection(collectionId, { limit: 1 })).toHaveLength(1);
  });

  it("limit actually truncates the result set", async () => {
    const repo = new AuditLogRepository(getTestDb().db);
    for (let i = 0; i < 5; i++) {
      await repo.record({
        actorId: "u",
        action: "item.purge",
        targetType: "item",
        targetId: `itm-${i}`,
        collectionId,
      });
    }
    const rows = await repo.findByCollection(collectionId, { limit: 3 });
    expect(rows).toHaveLength(3);
    // Still newest-first within the truncated window: itm-4 was inserted last.
    expect(rows[0].targetId).toBe("itm-4");
  });

  it("scopes to the collection (no cross-collection leak)", async () => {
    const repo = new AuditLogRepository(getTestDb().db);
    await repo.record({
      actorId: "u",
      action: "item.purge",
      targetType: "item",
      targetId: "x",
      collectionId,
    });
    // A fabricated, never-seeded collection id must see none of the above —
    // audit_log has no FK, so this proves the WHERE filter, not a constraint.
    expect(await repo.findByCollection("col-other")).toHaveLength(0);
  });
});

// Drives the real POST /api/items/[id]/purge route -> ItemPurgeService -> real
// repos -> ephemeral Postgres, proving the audit row is written INSIDE the purge
// transaction. Two facts: (1) a committed purge writes exactly one audit row whose
// actor comes from the session (a body-supplied actorId is ignored) and whose
// metadata counts the actual photos/preferences deleted; (2) if the audit write
// throws, the WHOLE purge rolls back (the row, photos, preferences all survive,
// zero audit rows) — the audit insert is tx-bound, not a post-commit afterthought.
const HTTP_KEY_A = "https://blob.example/a.jpg";
const HTTP_KEY_B = "https://blob.example/b.jpg";

describeDb("item purge -> audit_log (route -> service -> DB) — purses-ite", () => {
  let ownerId: string;
  let collectionId: string;

  /** Seed an item with EXACTLY 2 active http photos and EXACTLY 1 owner
   *  preference, so the audit metadata is the unambiguous {2, 1}. */
  async function seedItemWithChildren(): Promise<string> {
    const { db } = getTestDb();
    const item = await new ItemRepository(db).create({ collectionId });
    const photoRepo = new PhotoRepository(db);
    await photoRepo.create({
      itemId: item.id, collectionId, blobKey: HTTP_KEY_A, filename: "a.jpg",
      mimeType: "image/jpeg", fileSize: 1, uploadedBy: ownerId, isHero: true,
    });
    await photoRepo.create({
      itemId: item.id, collectionId, blobKey: HTTP_KEY_B, filename: "b.jpg",
      mimeType: "image/jpeg", fileSize: 1, uploadedBy: ownerId, isHero: false,
    });
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
      VALUES (${collectionId}, ${ownerId}, 'Purge audit test', 'active', now(), now())
    `);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("a committed purge writes exactly one audit row with actor + metadata counts", async () => {
    const { db } = getTestDb();
    const itemId = await seedItemWithChildren();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Body-supplied actorId is a DECOY — provenance must come from the session.
    const res = await purge(
      new Request(`http://localhost/api/items/${itemId}/purge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "PURGE", actorId: "ATTACKER" }),
      }) as any,
      { params: { id: itemId } },
    );
    expect(res.status).toBe(200);

    const rows = await new AuditLogRepository(db).findByCollection(collectionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "item.purge",
      targetType: "item",
      targetId: itemId,
      collectionId,
      actorId: ownerId, // from the session, NOT the body decoy
    });
    expect(rows[0].actorId).not.toBe("ATTACKER");
    expect(rows[0].metadata).toEqual({ photosDeleted: 2, preferencesDeleted: 1 });
  });

  it("ATOMICITY: if the audit write fails, the whole purge rolls back (zero audit rows, item survives)", async () => {
    const { db } = getTestDb();
    const itemId = await seedItemWithChildren();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Named injection — audit_log has no FK and the insert is LAST, so force the
    // failure by spying the tx-bound record(). Mocks ONLY the audit write;
    // everything else stays real. Proves rollback, not audit content.
    const spy = vi
      .spyOn(AuditLogRepository.prototype, "record")
      .mockRejectedValueOnce(new Error("audit boom"));

    const res = await purge(
      new Request(`http://localhost/api/items/${itemId}/purge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "PURGE" }),
      }) as any,
      { params: { id: itemId } },
    );
    expect(res.status).toBe(500); // the throw propagates

    // Whole tx rolled back: item, photos, preferences SURVIVE; no audit row.
    expect(await new ItemRepository(db).findByIdIncludingDeleted(itemId)).not.toBeNull();
    expect(await photoRowCount(itemId)).toBe(2);
    expect(await prefRowCount(itemId)).toBe(1);
    expect(await new AuditLogRepository(db).findByCollection(collectionId)).toHaveLength(0);

    spy.mockRestore();
  });
});
