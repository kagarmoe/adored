// Integration tests for the DAL capability chokepoint (purses-89g, 55c.2).
// Un-mocked DB seam: real repos + real Postgres; mocks only getSession/requireAuth.
// Gated: RUN_DB_TESTS=1.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedUserRow } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  requireAuth: async () => {
    const s = await mockGetSession();
    if (!s?.user) throw new Error("Unauthorized");
    return s.user;
  },
}));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import {
  requireApiCapability,
  requireApiItemCapability,
  requireApiInvitationCapability,
  requireApiCollectionAccess,
  requireApiCollectionOwner,
  requireApiResultAccess,
} from "@/server/dal/collection-access";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Create a minimal collection row owned by ownerId. Returns collectionId. */
async function seedCollection(ownerId: string): Promise<string> {
  const { db } = getTestDb();
  const collectionId = generateId("col");
  await db.execute(sql`
    INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
    VALUES (${collectionId}, ${ownerId}, 'Access Test', 'active', now(), now())
  `);
  return collectionId;
}

/** Add a curator membership for userId in the collection. */
async function addCurator(collectionId: string, userId: string): Promise<void> {
  const { db } = getTestDb();
  await new MembershipRepository(db).create({
    collectionId,
    userId,
    role: "curator",
  });
}

/** Seed an invitation row in the collection. Returns invitationId. */
async function seedInvitation(collectionId: string): Promise<string> {
  const { db } = getTestDb();
  const inv = await new InvitationRepository(db).create({
    collectionId,
    email: "invitee@adored.test",
    token: generateId("tok"),
  });
  return inv.id;
}

describeDb("requireApiCapability — purses-89g DAL chokepoint", () => {
  let ownerId: string;
  let curatorId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
    curatorId = await seedUserRow("curator");
  });
  afterAll(async () => { await closeDb(); });

  it("returns the collection for the owner on a curator-level op", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const result = await requireApiCapability(db, collectionId, ownerId, "collection:read");
    expect(result).not.toBeInstanceOf(Response);
    expect((result as any).id).toBe(collectionId);
  });

  it("returns the collection for the owner on an owner-level op", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const result = await requireApiCapability(db, collectionId, ownerId, "collection:manage");
    expect(result).not.toBeInstanceOf(Response);
    expect((result as any).id).toBe(collectionId);
  });

  it("returns the collection for a curator on a curator-level op (items:write)", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    await addCurator(collectionId, curatorId);
    const result = await requireApiCapability(db, collectionId, curatorId, "items:write");
    expect(result).not.toBeInstanceOf(Response);
    expect((result as any).id).toBe(collectionId);
  });

  // THE EPIC'S LOAD-BEARING ASSERTION: curator allowed curator-op, 403 on owner-op.
  it("403s a curator on an owner-level op (members:manage) — state unchanged", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    await addCurator(collectionId, curatorId);

    const result = await requireApiCapability(db, collectionId, curatorId, "members:manage");
    expect((result as Response).status).toBe(403);

    // State: the membership still exists (no side effect from the 403 gate)
    const membership = await new MembershipRepository(db).findByUser(curatorId, collectionId);
    expect(membership).not.toBeNull();
  });

  it("403s a curator on an owner-level op (collection:purge)", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    await addCurator(collectionId, curatorId);
    const result = await requireApiCapability(db, collectionId, curatorId, "collection:purge");
    expect((result as Response).status).toBe(403);
  });

  it("403s a non-member (stranger) on any op", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const result = await requireApiCapability(db, collectionId, "intruder_user", "collection:read");
    expect((result as Response).status).toBe(403);
  });

  it("404s when the collection is absent", async () => {
    const { db } = getTestDb();
    const result = await requireApiCapability(db, "col_does_not_exist", ownerId, "collection:read");
    expect((result as Response).status).toBe(404);
  });
});

describeDb("requireApiItemCapability — purses-89g", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
  });
  afterAll(async () => { await closeDb(); });

  it("404s an absent item", async () => {
    const { db } = getTestDb();
    const result = await requireApiItemCapability(db, "item_does_not_exist", ownerId, "items:read");
    expect((result as Response).status).toBe(404);
  });

  it("returns the item for the owner on an allowed op", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId });
    const result = await requireApiItemCapability(db, item.id, ownerId, "items:read");
    expect(result).not.toBeInstanceOf(Response);
    expect((result as any).id).toBe(item.id);
  });

  it("resolves a soft-deleted item ONLY with includeDeleted (lifecycle ops)", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId });
    await new ItemRepository(db).softDelete(item.id);
    // Lifecycle op (purge/restore/remove-from-sorts) opts in → resolves the deleted row.
    const ok = await requireApiItemCapability(db, item.id, ownerId, "items:purge", {
      includeDeleted: true,
    });
    expect(ok).not.toBeInstanceOf(Response);
    expect((ok as any).id).toBe(item.id);
  });

  it("404s a soft-deleted item for a read/edit op (default resolution, no leak)", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId });
    await new ItemRepository(db).softDelete(item.id);
    // Default (no includeDeleted): a soft-deleted item is invisible to reads/edits — 404,
    // matching the pre-pv9 GET /items/[id] findById behavior (no soft-deleted-item leak).
    const result = await requireApiItemCapability(db, item.id, ownerId, "items:read");
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
  });

  it("403s a non-member trying to access an item from a foreign collection", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId });
    const result = await requireApiItemCapability(db, item.id, "intruder_user", "items:read");
    expect((result as Response).status).toBe(403);
  });

  it("403s a curator on an owner-op via the item path", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const curatorId = await seedUserRow("item-curator");
    await addCurator(collectionId, curatorId);
    const item = await new ItemRepository(db).create({ collectionId });
    const result = await requireApiItemCapability(db, item.id, curatorId, "items:purge");
    expect((result as Response).status).toBe(403);
  });
});

describeDb("requireApiInvitationCapability — purses-89g", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
  });
  afterAll(async () => { await closeDb(); });

  it("404s an absent invitation", async () => {
    const { db } = getTestDb();
    const result = await requireApiInvitationCapability(db, "inv_does_not_exist", ownerId, "invitations:read");
    expect((result as Response).status).toBe(404);
  });

  it("returns the invitation for the owner on an allowed op", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const invitationId = await seedInvitation(collectionId);
    const result = await requireApiInvitationCapability(db, invitationId, ownerId, "invitations:read");
    expect(result).not.toBeInstanceOf(Response);
    expect((result as any).id).toBe(invitationId);
  });

  it("403s a non-member on an invitation from a foreign collection", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const invitationId = await seedInvitation(collectionId);
    const result = await requireApiInvitationCapability(db, invitationId, "intruder_user", "invitations:read");
    expect((result as Response).status).toBe(403);
  });

  it("403s a curator on an owner-op via the invitation path", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const curatorId = await seedUserRow("inv-curator");
    await addCurator(collectionId, curatorId);
    const invitationId = await seedInvitation(collectionId);
    // invitations:read is owner-level — curator should be 403
    const result = await requireApiInvitationCapability(db, invitationId, curatorId, "invitations:read");
    expect((result as Response).status).toBe(403);
  });
});

describeDb("requireApiCollectionAccess (re-expressed guard) — behavior parity", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
  });
  afterAll(async () => { await closeDb(); });

  it("returns the collection for the owner (no membership row)", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const result = await requireApiCollectionAccess(db, collectionId, ownerId);
    expect(result).not.toBeInstanceOf(Response);
    expect((result as any).id).toBe(collectionId);
  });

  it("returns the collection for a curator member", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const curatorId = await seedUserRow("access-curator");
    await addCurator(collectionId, curatorId);
    const result = await requireApiCollectionAccess(db, collectionId, curatorId);
    expect(result).not.toBeInstanceOf(Response);
    expect((result as any).id).toBe(collectionId);
  });

  it("403s a non-member (identical to prior behavior)", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const result = await requireApiCollectionAccess(db, collectionId, "intruder_user");
    expect((result as Response).status).toBe(403);
  });

  it("404s an absent collection (identical to prior behavior)", async () => {
    const { db } = getTestDb();
    const result = await requireApiCollectionAccess(db, "col_does_not_exist", ownerId);
    expect((result as Response).status).toBe(404);
  });
});

describeDb("requireApiCollectionOwner (re-expressed guard) — behavior parity", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
  });
  afterAll(async () => { await closeDb(); });

  it("returns the collection for the owner", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const result = await requireApiCollectionOwner(db, collectionId, ownerId);
    expect(result).not.toBeInstanceOf(Response);
    expect((result as any).id).toBe(collectionId);
  });

  it("403s a curator member (exists-but-not-owner — identical to prior behavior)", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const curatorId = await seedUserRow("owner-check-curator");
    await addCurator(collectionId, curatorId);
    const result = await requireApiCollectionOwner(db, collectionId, curatorId);
    expect((result as Response).status).toBe(403);
  });

  it("403s a non-member (identical to prior behavior)", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const result = await requireApiCollectionOwner(db, collectionId, "intruder_user");
    expect((result as Response).status).toBe(403);
  });

  it("404s an absent collection (identical to prior behavior)", async () => {
    const { db } = getTestDb();
    const result = await requireApiCollectionOwner(db, "col_does_not_exist", ownerId);
    expect((result as Response).status).toBe(404);
  });
});

describeDb("requireApiResultAccess (unchanged — curator-private) — parity", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
  });
  afterAll(async () => { await closeDb(); });

  it("returns the result for its own curator (who is also owner)", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const result = await new SortResultRepository(db).create({
      collectionId, curatorId: ownerId, name: "R", status: "draft",
    });
    const out = await requireApiResultAccess(db, result.id, ownerId);
    expect(out).not.toBeInstanceOf(Response);
    expect((out as any).id).toBe(result.id);
  });

  it("403s a member who is not the result's curator (member-not-curator 403 — parity)", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const result = await new SortResultRepository(db).create({
      collectionId, curatorId: ownerId, name: "R", status: "draft",
    });
    const memberId = await seedUserRow("result-member");
    await addCurator(collectionId, memberId);
    const out = await requireApiResultAccess(db, result.id, memberId);
    expect((out as Response).status).toBe(403);
  });

  it("404s an absent result id (parity)", async () => {
    const { db } = getTestDb();
    const out = await requireApiResultAccess(db, "res_does_not_exist", ownerId);
    expect((out as Response).status).toBe(404);
  });

  it("403s a non-member (IDOR — parity)", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const result = await new SortResultRepository(db).create({
      collectionId, curatorId: ownerId, name: "R", status: "draft",
    });
    const out = await requireApiResultAccess(db, result.id, "intruder_user");
    expect((out as Response).status).toBe(403);
  });
});
