// Real-DB integration proof for the disposition routes:
//   POST   /api/collections/[id]/dispositions          (set a disposition on an item)
//   GET    /api/collections/[id]/dispositions          (list the caller's own dispositions)
//   DELETE /api/collections/[id]/dispositions/[itemId]  (bring an item back — idempotent)
//
// AUTHZ (Epic C PR1, Task 5):
//   - POST/DELETE resolve the ITEM via requireApiItemCapability(..., "preferences:write")
//     AND assert item.collectionId === params.id (404 on mismatch — no cross-collection
//     existence oracle). curatorId is ALWAYS session.user.id, never from the body.
//   - GET uses requireApiCollectionAccess and scopes the list to session.user.id; the
//     ?disposition= query is a filter hint only.
//   - Dispositions are keyed (itemId, curatorId) — a co-member's DELETE/GET can only
//     touch/read THEIR OWN rows, never another curator's (the co-member IDOR case).
//
// Mocks ONLY the two true boundaries: auth (to drive curator A / curator B / stranger)
// and getDb -> the test db. Un-mocked route -> DispositionController -> repo -> pg.
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { ItemDispositionRepository } from "@/server/repositories/implementations/ItemDispositionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));

vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import {
  POST as postDisposition,
  GET as listDispositions,
} from "@/app/api/collections/[id]/dispositions/route";
import { DELETE as deleteDisposition } from "@/app/api/collections/[id]/dispositions/[itemId]/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// ── helpers ──────────────────────────────────────────────────────────────────

function postReq(collectionId: string, body: unknown): Request {
  return new Request(`http://localhost/api/collections/${collectionId}/dispositions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getReq(collectionId: string, disposition?: string): Request {
  const qs = disposition ? `?disposition=${disposition}` : "";
  return new Request(`http://localhost/api/collections/${collectionId}/dispositions${qs}`);
}

function deleteReq(collectionId: string, itemId: string): Request {
  return new Request(
    `http://localhost/api/collections/${collectionId}/dispositions/${itemId}`,
    { method: "DELETE" },
  );
}

describeDb("disposition routes (route -> DispositionController -> repo -> DB)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  // ── (1) happy path: POST → 201, row persisted ──────────────────────────────
  it("(1) curator A POSTs a disposition on an item in their collection → 201 and the row is persisted", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "A's bag" });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Non-vacuous: no disposition before.
    const dispRepo = new ItemDispositionRepository(db);
    expect(await dispRepo.findByItem(item.id, ownerId)).toBeNull();

    const res = await postDisposition(
      postReq(collectionId, { itemId: item.id, disposition: "deferred" }) as any,
      { params: Promise.resolve({ id: collectionId }) } as any,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      collectionId,
      curatorId: ownerId,
      itemId: item.id,
      disposition: "deferred",
    });

    // DB-state: the row is PERSISTED, keyed to A.
    const persisted = await dispRepo.findByItem(item.id, ownerId);
    expect(persisted).not.toBeNull();
    expect(persisted!.disposition).toBe("deferred");
    expect(persisted!.collectionId).toBe(collectionId);
  });

  // ── (2) cross-collection: no access → no oracle, no row ────────────────────
  // A POSTs an itemId that belongs to collection B (A is not a member of B) against
  // collA's URL. The item-capability gate resolves itemB -> collB, where A has no
  // access, so the gate returns 403 BEFORE the collectionId-mismatch 404 check is
  // reached. Either way the result is non-leaking (403 or 404) and NO row is written.
  // (The mismatch-404 path — where the caller DOES have item access but supplies the
  //  wrong URL id — is exercised by test (5b) for DELETE.)
  it("(2) POST with an itemId from a collection A cannot access → no access (403/404) and writes no row", async () => {
    const { db } = getTestDb();
    // Collection A (owned by A) and collection B (owned by a different user).
    const collA = await seedBareCollection(ownerId);
    const ownerB = await seedUserRow("ownerB");
    const collB = await seedBareCollection(ownerB);
    const itemB = await new ItemRepository(db).create({ collectionId: collB, name: "B's bag" });

    // A is the caller, POSTing itemB to collA's dispositions endpoint.
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await postDisposition(
      postReq(collA, { itemId: itemB.id, disposition: "deferred" }) as any,
      { params: Promise.resolve({ id: collA }) } as any,
    );
    // No cross-tenant access: 403 (capability gate) — never a 2xx, never a 500.
    expect([403, 404]).toContain(res.status);

    // No disposition row for itemB under A — nor under anyone.
    const dispRepo = new ItemDispositionRepository(db);
    expect(await dispRepo.findByItem(itemB.id, ownerId)).toBeNull();
    expect(await dispRepo.findByCollectionAndCurator(collB, ownerId)).toHaveLength(0);
  });

  // ── (2b) item-access OK but URL collection id mismatched → 404 (no oracle) ──
  // A owns BOTH collA and collA2. itemA belongs to collA, so A passes the item-capability
  // gate. But A POSTs against collA2's URL. item.collectionId (collA) !== params.id
  // (collA2) → 404. This is the precise mismatch-404 path (caller HAS item access, wrong
  // URL id) — it must NOT confirm itemA's existence by behaving differently than an absent
  // item would, and it must NOT write a row into collA2.
  it("(2b) POST with item-access but a mismatched URL collection id → 404 and writes no row", async () => {
    const { db } = getTestDb();
    const collA = await seedBareCollection(ownerId);
    const collA2 = await seedBareCollection(ownerId);
    const itemA = await new ItemRepository(db).create({ collectionId: collA, name: "A's bag" });

    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await postDisposition(
      postReq(collA2, { itemId: itemA.id, disposition: "deferred" }) as any,
      { params: Promise.resolve({ id: collA2 }) } as any,
    );
    expect(res.status).toBe(404);

    // No row written under either collection.
    const dispRepo = new ItemDispositionRepository(db);
    expect(await dispRepo.findByItem(itemA.id, ownerId)).toBeNull();
    expect(await dispRepo.findByCollectionAndCurator(collA2, ownerId)).toHaveLength(0);
  });

  // ── (3) already-triaged → 409 ──────────────────────────────────────────────
  it("(3) POST on an item that already has the caller's preference → 409", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Triaged bag" });

    // Seed a preference row for A on this item (disposed <=> untriaged: a triaged item refuses).
    await new CollectionPreferenceItemRepository(db).create({
      collectionId,
      curatorId: ownerId,
      itemId: item.id,
      score: 0.5,
      confidence: 0.5,
      rankBucket: "medium",
      comparisonCount: 0,
    });

    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await postDisposition(
      postReq(collectionId, { itemId: item.id, disposition: "set_aside" }) as any,
      { params: Promise.resolve({ id: collectionId }) } as any,
    );
    expect(res.status).toBe(409);

    // No disposition row written (the preference blocks it).
    expect(await new ItemDispositionRepository(db).findByItem(item.id, ownerId)).toBeNull();
  });

  // ── (3b) invalid body → 400 / absent itemId → 400 ──────────────────────────
  it("(3b) POST with absent itemId → 400, and an invalid disposition enum → 400 — no row written", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Bag" });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Absent itemId → 400 (guard before any DB work).
    const resNoItem = await postDisposition(
      postReq(collectionId, { disposition: "deferred" }) as any,
      { params: Promise.resolve({ id: collectionId }) } as any,
    );
    expect(resNoItem.status).toBe(400);

    // Invalid disposition enum → 400 (Zod inside setDisposition).
    const resBadEnum = await postDisposition(
      postReq(collectionId, { itemId: item.id, disposition: "bin_it" }) as any,
      { params: Promise.resolve({ id: collectionId }) } as any,
    );
    expect(resBadEnum.status).toBe(400);

    expect(await new ItemDispositionRepository(db).findByItem(item.id, ownerId)).toBeNull();
  });

  // ── (4) CO-MEMBER IDOR (the critical case) ─────────────────────────────────
  it("(4) co-member B cannot delete or read curator A's disposition (keyed by curatorId)", async () => {
    const { db } = getTestDb();
    // A owns the collection; B is added as a curator member.
    const collectionId = await seedBareCollection(ownerId);
    const curatorB = await seedUserRow("curatorB");
    await new MembershipRepository(db).create({
      collectionId,
      userId: curatorB,
      role: "curator",
    });
    const item = await new ItemRepository(db).create({ collectionId, name: "Shared bag" });

    // A makes a disposition on the item.
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const setRes = await postDisposition(
      postReq(collectionId, { itemId: item.id, disposition: "deferred" }) as any,
      { params: Promise.resolve({ id: collectionId }) } as any,
    );
    expect(setRes.status).toBe(201);

    const dispRepo = new ItemDispositionRepository(db);
    // Present before: A's row exists.
    expect(await dispRepo.findByItem(item.id, ownerId)).not.toBeNull();

    // B DELETEs the SAME item's disposition. B is a legitimate curator (passes the
    // capability gate), but the delete is keyed (itemId, curatorId=B) — A's row survives.
    mockGetSession.mockResolvedValue({ user: { id: curatorB } });
    const delRes = await deleteDisposition(
      deleteReq(collectionId, item.id) as any,
      { params: Promise.resolve({ id: collectionId, itemId: item.id }) } as any,
    );
    expect(delRes.status).toBe(200); // idempotent — B had no row, deletes nothing

    // A's row is STILL present — B's delete did not touch it.
    const aRowAfter = await dispRepo.findByItem(item.id, ownerId);
    expect(aRowAfter).not.toBeNull();
    expect(aRowAfter!.disposition).toBe("deferred");

    // B's GET on the collection's dispositions returns only B's rows — A's are not leaked.
    const bListRes = await listDispositions(getReq(collectionId) as any, {
      params: Promise.resolve({ id: collectionId }),
    } as any);
    expect(bListRes.status).toBe(200);
    const bList = await bListRes.json();
    expect(Array.isArray(bList)).toBe(true);
    expect(bList).toHaveLength(0);

    // A's own GET sees A's one row (proves the scoping is per-curator, not vacuously empty).
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const aListRes = await listDispositions(getReq(collectionId) as any, {
      params: Promise.resolve({ id: collectionId }),
    } as any);
    expect(aListRes.status).toBe(200);
    const aList = await aListRes.json();
    expect(aList).toHaveLength(1);
    expect(aList[0]).toMatchObject({ itemId: item.id, curatorId: ownerId, disposition: "deferred" });
  });

  // ── (4b) curator B CAN delete their OWN disposition; A's is untouched ───────
  it("(4b) when both A and B have dispositions on the same item, B's DELETE removes only B's row", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const curatorB = await seedUserRow("curatorB2");
    await new MembershipRepository(db).create({ collectionId, userId: curatorB, role: "curator" });
    const item = await new ItemRepository(db).create({ collectionId, name: "Shared bag 2" });
    const dispRepo = new ItemDispositionRepository(db);

    // A's disposition.
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    await postDisposition(
      postReq(collectionId, { itemId: item.id, disposition: "deferred" }) as any,
      { params: Promise.resolve({ id: collectionId }) } as any,
    );
    // B's disposition (different row, same item).
    mockGetSession.mockResolvedValue({ user: { id: curatorB } });
    await postDisposition(
      postReq(collectionId, { itemId: item.id, disposition: "set_aside" }) as any,
      { params: Promise.resolve({ id: collectionId }) } as any,
    );
    expect(await dispRepo.findByItem(item.id, ownerId)).not.toBeNull();
    expect(await dispRepo.findByItem(item.id, curatorB)).not.toBeNull();

    // B deletes their own → 200, only B's row gone.
    const delRes = await deleteDisposition(
      deleteReq(collectionId, item.id) as any,
      { params: Promise.resolve({ id: collectionId, itemId: item.id }) } as any,
    );
    expect(delRes.status).toBe(200);
    expect(await dispRepo.findByItem(item.id, curatorB)).toBeNull();
    expect(await dispRepo.findByItem(item.id, ownerId)).not.toBeNull();
  });

  // ── (5) idempotent DELETE on an absent disposition → 200 ───────────────────
  it("(5) DELETE on an item with no disposition for the caller → 200 (idempotent), no error", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Never-disposed bag" });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await deleteDisposition(
      deleteReq(collectionId, item.id) as any,
      { params: Promise.resolve({ id: collectionId, itemId: item.id }) } as any,
    );
    expect(res.status).toBe(200);
  });

  // ── (5b) DELETE with item from another collection → 404 ────────────────────
  it("(5b) DELETE an itemId that belongs to another collection (URL id mismatch) → 404", async () => {
    const { db } = getTestDb();
    const collA = await seedBareCollection(ownerId);
    const itemA = await new ItemRepository(db).create({ collectionId: collA, name: "A bag" });
    const ownerB = await seedUserRow("ownerB3");
    const collB = await seedBareCollection(ownerB);

    // A disposes itemA in collA.
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    await postDisposition(
      postReq(collA, { itemId: itemA.id, disposition: "deferred" }) as any,
      { params: Promise.resolve({ id: collA }) } as any,
    );

    // DELETE itemA but with collB as the URL id → 404 (item.collectionId !== params.id).
    // (A is not a member of collB, but the item-capability gate resolves item -> collA where A
    //  IS owner, so the gate passes; the collectionId mismatch is what produces 404.)
    const res = await deleteDisposition(
      deleteReq(collB, itemA.id) as any,
      { params: Promise.resolve({ id: collB, itemId: itemA.id }) } as any,
    );
    expect(res.status).toBe(404);

    // A's row is untouched.
    expect(await new ItemDispositionRepository(db).findByItem(itemA.id, ownerId)).not.toBeNull();
  });

  // ── (6) unauthenticated → 401 on all three handlers ────────────────────────
  it("(6) unauthenticated caller → 401 on POST, GET, and DELETE — and no row written", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Bag" });
    mockGetSession.mockResolvedValue(null);

    const postRes = await postDisposition(
      postReq(collectionId, { itemId: item.id, disposition: "deferred" }) as any,
      { params: Promise.resolve({ id: collectionId }) } as any,
    );
    expect(postRes.status).toBe(401);

    const getRes = await listDispositions(getReq(collectionId) as any, {
      params: Promise.resolve({ id: collectionId }),
    } as any);
    expect(getRes.status).toBe(401);

    const delRes = await deleteDisposition(
      deleteReq(collectionId, item.id) as any,
      { params: Promise.resolve({ id: collectionId, itemId: item.id }) } as any,
    );
    expect(delRes.status).toBe(401);

    // Non-vacuous: a real collection+item existed; nothing was written.
    expect(await new ItemDispositionRepository(db).findByItem(item.id, ownerId)).toBeNull();
  });

  // ── (7) GET stranger (non-member) → 403 ────────────────────────────────────

  // ── (8) GET ?disposition= filter narrows the list ──────────────────────────
  it("(8) GET ?disposition=set_aside returns only set_aside rows for the caller", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const itemA = await new ItemRepository(db).create({ collectionId, name: "Deferred bag" });
    const itemB = await new ItemRepository(db).create({ collectionId, name: "Set-aside bag" });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    await postDisposition(
      postReq(collectionId, { itemId: itemA.id, disposition: "deferred" }) as any,
      { params: Promise.resolve({ id: collectionId }) } as any,
    );
    await postDisposition(
      postReq(collectionId, { itemId: itemB.id, disposition: "set_aside" }) as any,
      { params: Promise.resolve({ id: collectionId }) } as any,
    );

    const allRes = await listDispositions(getReq(collectionId) as any, {
      params: Promise.resolve({ id: collectionId }),
    } as any);
    expect((await allRes.json())).toHaveLength(2);

    const filteredRes = await listDispositions(getReq(collectionId, "set_aside") as any, {
      params: Promise.resolve({ id: collectionId }),
    } as any);
    expect(filteredRes.status).toBe(200);
    const filtered = await filteredRes.json();
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ itemId: itemB.id, disposition: "set_aside" });
  });
});
