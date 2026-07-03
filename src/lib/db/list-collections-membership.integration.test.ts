// Integration tests for the listCollections membership gap (purses-uc8q, r50o).
// A curator-member (accepted an invite ⇒ a membership row exists) must see the
// borrowed collection in their list; a PENDING invitation must NOT (IDOR guard).
// Un-mocked DB seam: real repo + real Postgres. Gated: RUN_DB_TESTS=1.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedUserRow } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { CollectionController } from "@/server/api/collections";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Create a collection row owned by ownerId. Returns collectionId. */
async function seedCollection(ownerId: string, name = "Owned"): Promise<string> {
  const { db } = getTestDb();
  const collectionId = generateId("col");
  await db.execute(sql`
    INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
    VALUES (${collectionId}, ${ownerId}, ${name}, 'active', now(), now())
  `);
  return collectionId;
}

/** Soft-delete a collection (set deleted_at). */
async function softDeleteCollection(collectionId: string): Promise<void> {
  const { db } = getTestDb();
  await db.execute(sql`
    UPDATE collections SET deleted_at = now() WHERE id = ${collectionId}
  `);
}

const ids = (cs: { id: string }[]) => cs.map((c) => c.id).sort();

describeDb("CollectionRepository.findByOwnerOrMember — r50o", () => {
  let ownerId: string;
  let userId: string; // the viewer whose list we assert
  let otherOwnerId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
    userId = await seedUserRow("viewer");
    otherOwnerId = await seedUserRow("other-owner");
  });
  afterAll(async () => {
    await closeDb();
  });

  it("returns collections the user OWNS", async () => {
    const { db } = getTestDb();
    const repo = new CollectionRepository(db);
    const c1 = await seedCollection(userId, "Mine A");
    const c2 = await seedCollection(userId, "Mine B");
    await seedCollection(otherOwnerId, "Not mine");

    const result = await repo.findByOwnerOrMember(userId);
    expect(ids(result)).toEqual([c1, c2].sort());
  });

  it("returns a collection the user is a CURATOR-MEMBER of (membership row exists, not owner)", async () => {
    const { db } = getTestDb();
    const repo = new CollectionRepository(db);
    const borrowed = await seedCollection(otherOwnerId, "Borrowed");
    await new MembershipRepository(db).create({
      collectionId: borrowed,
      userId,
      role: "curator",
    });

    const result = await repo.findByOwnerOrMember(userId);
    expect(ids(result)).toEqual([borrowed]);
  });

  it("returns owned ∪ member collections together", async () => {
    const { db } = getTestDb();
    const repo = new CollectionRepository(db);
    const owned = await seedCollection(userId, "Owned");
    const borrowed = await seedCollection(otherOwnerId, "Borrowed");
    await new MembershipRepository(db).create({
      collectionId: borrowed,
      userId,
      role: "curator",
    });

    const result = await repo.findByOwnerOrMember(userId);
    expect(ids(result)).toEqual([owned, borrowed].sort());
  });

  // LOAD-BEARING: a PENDING invitation (no membership row) must NOT surface the
  // collection. Reading invitationsTable here would be an IDOR-by-list leak.
  it("does NOT return a collection for which the user only has a PENDING invitation", async () => {
    const { db } = getTestDb();
    const repo = new CollectionRepository(db);
    const notJoined = await seedCollection(otherOwnerId, "Invite Only");
    // A pending invitation exists, but NO membership row (invite not accepted).
    await new InvitationRepository(db).create({
      collectionId: notJoined,
      email: "viewer@adored.test",
      token: generateId("tok"),
    });

    const result = await repo.findByOwnerOrMember(userId);
    expect(ids(result)).toEqual([]);
  });

  it("does NOT duplicate a collection the user both OWNS and has a membership row for", async () => {
    const { db } = getTestDb();
    const repo = new CollectionRepository(db);
    const both = await seedCollection(userId, "Owned+Member");
    // A membership row for the owner too (theoretically possible) — must dedupe.
    await new MembershipRepository(db).create({
      collectionId: both,
      userId,
      role: "curator",
    });

    const result = await repo.findByOwnerOrMember(userId);
    expect(result.filter((c) => c.id === both)).toHaveLength(1);
  });

  it("excludes SOFT-DELETED collections (owned and member alike)", async () => {
    const { db } = getTestDb();
    const repo = new CollectionRepository(db);
    const ownedDeleted = await seedCollection(userId, "Owned Deleted");
    await softDeleteCollection(ownedDeleted);
    const borrowedDeleted = await seedCollection(otherOwnerId, "Borrowed Deleted");
    await new MembershipRepository(db).create({
      collectionId: borrowedDeleted,
      userId,
      role: "curator",
    });
    await softDeleteCollection(borrowedDeleted);
    const ownedActive = await seedCollection(userId, "Owned Active");

    const result = await repo.findByOwnerOrMember(userId);
    expect(ids(result)).toEqual([ownedActive]);
  });
});

describeDb("CollectionController.listCollections — wires memberships (r50o)", () => {
  let ownerId: string;
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
    userId = await seedUserRow("controller-viewer");
  });
  afterAll(async () => {
    await closeDb();
  });

  it("includes a collection the user is a member of, not just owned", async () => {
    const { db } = getTestDb();
    const owned = await seedCollection(userId, "Mine");
    const borrowed = await seedCollection(ownerId, "Borrowed");
    await new MembershipRepository(db).create({
      collectionId: borrowed,
      userId,
      role: "curator",
    });

    const result = await CollectionController.fromDb(db).listCollections(userId);
    expect(ids(result)).toEqual([owned, borrowed].sort());
  });

  it("does NOT include a collection for which the user only has a pending invitation", async () => {
    const { db } = getTestDb();
    const notJoined = await seedCollection(ownerId, "Invite Only");
    await new InvitationRepository(db).create({
      collectionId: notJoined,
      email: "controller-viewer@adored.test",
      token: generateId("tok"),
    });

    const result = await CollectionController.fromDb(db).listCollections(userId);
    expect(result).toEqual([]);
  });
});
