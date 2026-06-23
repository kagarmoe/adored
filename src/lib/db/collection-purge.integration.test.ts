// Un-mocked WHOLE-COLLECTION purge proof: real POST /api/collections/[id]/purge
// route -> CollectionPurgeService -> real repos -> ephemeral Postgres. Mocks ONLY
// the external boundaries: auth (so we can drive owner / member / stranger),
// @vercel/blob's `del` (so the blob store isn't hit — we assert it WAS called with
// the right keys), and getDb -> the test db.
//
// This is the authoritative proof of the cascade. The hard-delete proof is
// `CollectionRepository.findByIdIncludingDeleted` returning null after purge:
// findById filters deletedAt, so a null from it is non-distinguishing (a soft
// delete also nulls it). Only the including-deleted lookup proves the row is gone.
//
// Every "empty after" assertion is guarded by a "non-empty before" assertion in
// case 1, so a table that was never seeded can't make the suite vacuously pass.
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { AuditLogRepository } from "@/server/repositories/implementations/AuditLogRepository";

const { mockGetSession, mockBlobDel, mockBlobList } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockBlobDel: vi.fn(),
  mockBlobList: vi.fn(),
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
vi.mock("@vercel/blob", () => ({ del: mockBlobDel, list: mockBlobList }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { POST as purge } from "@/app/api/collections/[id]/purge/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// Two DISTINCT real http blob keys: one on an active photo, one on a soft-deleted
// photo. The service del's every http key regardless of soft-delete, so BOTH must
// be del'd — the soft-deleted photo's blob is the regression this pins.
const HTTP_KEY_ACTIVE = "https://blob.example/active.jpg";
const HTTP_KEY_SOFT = "https://blob.example/soft.jpg";

const COLLECTION_NAME = "My Beloved Bags";

/** Ids + name captured from a full seed, so each case can assert by exact id. */
interface FullSeed {
  collectionId: string;
  name: string;
  memberId: string;
  itemAId: string;
  itemBId: string;
  sessionId: string;
}

describeDb("POST /api/collections/[id]/purge (route -> service -> DB) — purgeCollection", () => {
  let ownerId: string;

  // ---- count helpers ---------------------------------------------------------
  // Direct WHERE collection_id where the column exists; subquery form for the
  // three tables that lack it (decision_events via sessions, sort_result_items /
  // sort_result_shares via sort_results).
  const countOf = (table: string) => (cid: string) =>
    getTestDb()
      .db.execute(sql`SELECT count(*)::int AS n FROM ${sql.raw(table)} WHERE collection_id = ${cid}`)
      .then((r) => Number((r as unknown as { n: number }[])[0].n));

  const countItems = countOf("items");
  const countPhotos = countOf("photos");
  const countPreferences = countOf("preferences");
  const countSessions = countOf("sessions");
  const countSortResults = countOf("sort_results");
  const countInvitations = countOf("invitations");
  const countMemberships = countOf("memberships");

  const countDecisions = (cid: string) =>
    getTestDb()
      .db.execute(
        sql`SELECT count(*)::int AS n FROM decision_events WHERE session_id IN (SELECT id FROM sessions WHERE collection_id = ${cid})`,
      )
      .then((r) => Number((r as unknown as { n: number }[])[0].n));

  const countSortResultItems = (cid: string) =>
    getTestDb()
      .db.execute(
        sql`SELECT count(*)::int AS n FROM sort_result_items WHERE sort_result_id IN (SELECT id FROM sort_results WHERE collection_id = ${cid})`,
      )
      .then((r) => Number((r as unknown as { n: number }[])[0].n));

  const countSortResultShares = (cid: string) =>
    getTestDb()
      .db.execute(
        sql`SELECT count(*)::int AS n FROM sort_result_shares WHERE sort_result_id IN (SELECT id FROM sort_results WHERE collection_id = ${cid})`,
      )
      .then((r) => Number((r as unknown as { n: number }[])[0].n));

  /** Every child-table count for a collection, in one shot. */
  async function allCounts(cid: string) {
    return {
      items: await countItems(cid),
      photos: await countPhotos(cid),
      preferences: await countPreferences(cid),
      sessions: await countSessions(cid),
      decisionEvents: await countDecisions(cid),
      sortResults: await countSortResults(cid),
      sortResultItems: await countSortResultItems(cid),
      sortResultShares: await countSortResultShares(cid),
      invitations: await countInvitations(cid),
      memberships: await countMemberships(cid),
    };
  }

  /** Insert a bare user row (auth is mocked, so no password needed). */
  async function seedUserRow(label: string): Promise<string> {
    const { db } = getTestDb();
    const id = generateId("user");
    await db
      .insert((await import("@/lib/db/schema")).user)
      .values({ id, email: `${label}-${id}@adored.test`, name: label });
    return id;
  }

  /**
   * Seed a FULL collection owned by `ownerId`, populating EVERY cascade table so
   * every empty-after assertion is non-vacuous:
   *   - a 2nd member (membership row),
   *   - 2 items,
   *   - 2 photos with distinct http blobKeys (one soft-deleted),
   *   - a session (owner) + 1 decision_event,
   *   - the 2nd member's preference (1 row, on item B),
   *   - a DRAFT result + 1 result-item,
   *   - a FINALIZED result + 1 result-item + 1 share,
   *   - 1 invitation.
   */
  async function seedFullCollection(): Promise<FullSeed> {
    const { db } = getTestDb();
    const collectionId = generateId("col");
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, slug, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, ${COLLECTION_NAME}, ${`slug-${collectionId}`}, 'active', now(), now())
    `);

    // A 2nd member (curator) — not the owner. Its preference + membership row must
    // both be erased by the total purge.
    const memberId = await seedUserRow("member");
    await new MembershipRepository(db).create({
      collectionId,
      userId: memberId,
      role: "curator",
    });

    const itemRepo = new ItemRepository(db);
    const itemA = await itemRepo.create({ collectionId });
    const itemB = await itemRepo.create({ collectionId });

    const photoRepo = new PhotoRepository(db);
    await photoRepo.create({
      itemId: itemA.id,
      collectionId,
      blobKey: HTTP_KEY_ACTIVE,
      filename: "active.jpg",
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: ownerId,
      isHero: true,
    });
    const softPhoto = await photoRepo.create({
      itemId: itemB.id,
      collectionId,
      blobKey: HTTP_KEY_SOFT,
      filename: "soft.jpg",
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: ownerId,
      isHero: false,
    });
    await photoRepo.softDelete(softPhoto.id); // soft-deleted, but its blob must STILL be del'd

    // Session (owner) + one decision event under it.
    const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    await new DecisionEventRepository(db).create({
      sessionId: session.id,
      type: "triage",
      decision: { itemId: itemA.id, result: "top" },
    });

    // The 2nd member's preference (on item B — the owner has none, so no
    // (item, curator) unique-index conflict).
    await new CollectionPreferenceItemRepository(db).create({
      collectionId,
      curatorId: memberId,
      itemId: itemB.id,
      score: 0.5,
      confidence: 1,
      rankBucket: "medium",
      comparisonCount: 0,
    });

    // A DRAFT result + 1 result-item.
    const resultRepo = new SortResultRepository(db);
    const resultItemRepo = new SortResultItemRepository(db);
    const draft = await resultRepo.create({
      collectionId,
      curatorId: ownerId,
      name: "Draft ranking",
      status: "draft",
    });
    await resultItemRepo.create({
      sortResultId: draft.id,
      itemId: itemA.id,
      computedRank: 1,
      computedBucket: "top",
    });

    // A FINALIZED result + 1 result-item + 1 share.
    const finalized = await resultRepo.create({
      collectionId,
      curatorId: ownerId,
      name: "Finalized ranking",
      status: "finalized",
    });
    await resultItemRepo.create({
      sortResultId: finalized.id,
      itemId: itemB.id,
      computedRank: 1,
      computedBucket: "high",
    });
    await new SortResultShareRepository(db).create({
      sortResultId: finalized.id,
      shareToken: generateId("tok"),
    });

    // One pending invitation.
    await new InvitationRepository(db).create({
      collectionId,
      email: "invitee@adored.test",
      token: generateId("invtok"),
    });

    return { collectionId, name: COLLECTION_NAME, memberId, itemAId: itemA.id, itemBId: itemB.id, sessionId: session.id };
  }

  function purgeReq(body?: unknown) {
    return new Request("http://localhost/api/collections/x/purge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    mockBlobDel.mockResolvedValue(undefined);
    mockBlobList.mockResolvedValue({ blobs: [], hasMore: false });
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("(1) owner purge cascades EVERY child table, hard-deletes the collection, writes ONE audit row, dels every http blob", async () => {
    const { db } = getTestDb();
    const seed = await seedFullCollection();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // NON-VACUOUS GUARD: every table is populated BEFORE the purge, so a later
    // "is 0" assertion proves a delete happened, not that nothing was ever there.
    const before = await allCounts(seed.collectionId);
    expect(before).toEqual({
      items: 2,
      photos: 2,
      preferences: 1,
      sessions: 1,
      decisionEvents: 1,
      sortResults: 2,
      sortResultItems: 2,
      sortResultShares: 1,
      invitations: 1,
      memberships: 1,
    });
    expect(
      await new CollectionRepository(db).findByIdIncludingDeleted(seed.collectionId),
    ).not.toBeNull();

    const res = await purge(purgeReq({ confirm: seed.name }) as any, {
      params: { id: seed.collectionId },
    });
    expect(res.status).toBe(200);

    // ALL ten child tables empty for the collection.
    const after = await allCounts(seed.collectionId);
    expect(after).toEqual({
      items: 0,
      photos: 0,
      preferences: 0,
      sessions: 0,
      decisionEvents: 0,
      sortResults: 0,
      sortResultItems: 0,
      sortResultShares: 0,
      invitations: 0,
      memberships: 0,
    });

    // The collection itself is physically gone (hard delete, not soft).
    expect(
      await new CollectionRepository(db).findByIdIncludingDeleted(seed.collectionId),
    ).toBeNull();

    // Exactly ONE audit row, written inside the purge tx, with the session actor
    // and metadata counting the actual photos/items erased.
    const audit = await new AuditLogRepository(db).findByCollection(seed.collectionId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "collection.purge",
      targetType: "collection",
      targetId: seed.collectionId,
      collectionId: seed.collectionId,
      actorId: ownerId,
    });
    expect(audit[0].metadata).toEqual({ photosDeleted: 2, itemsDeleted: 2 });

    // del called once per http key — the active AND the soft-deleted photo's blob.
    const delledKeys = mockBlobDel.mock.calls.map((c) => c[0]).sort();
    expect(delledKeys).toEqual([HTTP_KEY_ACTIVE, HTTP_KEY_SOFT].sort());
    expect(mockBlobDel).toHaveBeenCalledTimes(2);

    // Persisted resized variants for the whole collection are swept post-commit.
    expect(mockBlobList).toHaveBeenCalledWith({
      prefix: `variants/${seed.collectionId}/`,
      cursor: undefined,
    });
  });

  it("(2) soft-delete THEN purge resolves the deleted collection and erases everything (canonical DELETE -> purge path)", async () => {
    const { db } = getTestDb();
    const seed = await seedFullCollection();

    // The canonical path: a collection is soft-deleted first, then purged. The
    // route resolves it via findByIdIncludingDeleted, so the purge still finds it.
    await new CollectionRepository(db).softDelete(seed.collectionId);
    expect(await new CollectionRepository(db).findById(seed.collectionId)).toBeNull(); // soft-gone

    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await purge(purgeReq({ confirm: seed.name }) as any, {
      params: { id: seed.collectionId },
    });
    expect(res.status).toBe(200);

    const after = await allCounts(seed.collectionId);
    expect(Object.values(after).every((n) => n === 0)).toBe(true);
    expect(
      await new CollectionRepository(db).findByIdIncludingDeleted(seed.collectionId),
    ).toBeNull();
    expect(await new AuditLogRepository(db).findByCollection(seed.collectionId)).toHaveLength(1);
  });

  it("(3) ATOMICITY: if hardDelete throws, the WHOLE purge rolls back — nothing deleted, no audit row, collection survives", async () => {
    const { db } = getTestDb();
    const seed = await seedFullCollection();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const before = await allCounts(seed.collectionId);

    // Named injection at the LAST destructive step before the audit insert. The
    // service constructs `new CollectionRepository(tx)` inside the tx, so spying
    // the prototype intercepts the tx-bound instance. Proves rollback, not content.
    const spy = vi
      .spyOn(CollectionRepository.prototype, "hardDelete")
      .mockRejectedValueOnce(new Error("boom"));

    const res = await purge(purgeReq({ confirm: seed.name }) as any, {
      params: { id: seed.collectionId },
    });
    expect(res.status).toBe(500); // the throw propagates

    // The whole tx rolled back: EVERY child row survives at its seeded count.
    const after = await allCounts(seed.collectionId);
    expect(after).toEqual(before);
    // The collection is still present, and NO audit row was written.
    expect(
      await new CollectionRepository(db).findByIdIncludingDeleted(seed.collectionId),
    ).not.toBeNull();
    expect(await new AuditLogRepository(db).findByCollection(seed.collectionId)).toHaveLength(0);
    // No blob was del'd — the post-commit step never ran.
    expect(mockBlobDel).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("(4a) non-owner member -> 403; everything survives", async () => {
    const { db } = getTestDb();
    const seed = await seedFullCollection();
    mockGetSession.mockResolvedValue({ user: { id: seed.memberId } });

    const res = await purge(purgeReq({ confirm: seed.name }) as any, {
      params: { id: seed.collectionId },
    });
    expect(res.status).toBe(403);

    expect(
      await new CollectionRepository(db).findByIdIncludingDeleted(seed.collectionId),
    ).not.toBeNull();
    expect((await allCounts(seed.collectionId)).items).toBe(2);
    expect(mockBlobDel).not.toHaveBeenCalled();
  });

  it("(4b) absent collection id -> 404", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await purge(purgeReq({ confirm: "anything" }) as any, {
      params: { id: "col-absent" },
    });
    expect(res.status).toBe(404);
    expect(mockBlobDel).not.toHaveBeenCalled();
  });

  it("(4c) owner with a WRONG confirm -> 400; nothing deleted", async () => {
    const { db } = getTestDb();
    const seed = await seedFullCollection();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const before = await allCounts(seed.collectionId);
    const res = await purge(purgeReq({ confirm: "wrong" }) as any, {
      params: { id: seed.collectionId },
    });
    expect(res.status).toBe(400);

    expect(await allCounts(seed.collectionId)).toEqual(before);
    expect(
      await new CollectionRepository(db).findByIdIncludingDeleted(seed.collectionId),
    ).not.toBeNull();
    expect(mockBlobDel).not.toHaveBeenCalled();
  });

  it("(4d) non-owner with a WRONG confirm -> 403 (authz precedes confirm; no name/existence oracle)", async () => {
    const { db } = getTestDb();
    const seed = await seedFullCollection();
    mockGetSession.mockResolvedValue({ user: { id: seed.memberId } });

    // A non-owner gets 403 even with a wrong confirm — the authz gate runs BEFORE
    // body parsing, so a member can't probe the collection's name via a 400.
    const res = await purge(purgeReq({ confirm: "wrong" }) as any, {
      params: { id: seed.collectionId },
    });
    expect(res.status).toBe(403);
    expect(
      await new CollectionRepository(db).findByIdIncludingDeleted(seed.collectionId),
    ).not.toBeNull();
  });
});
