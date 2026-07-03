// @vitest-environment node
// Honest real-DB integration for the membership read path's user join
// (Epic 1 Task B): MembershipRepository.findByCollection -> ephemeral Postgres.
//
// The Members handoff needs each ACCEPTED member's name + email (for the avatar
// initial + the email line). The base memberships table carries neither — only
// user_id — so findByCollection LEFT JOINs the `user` table to populate the
// optional name/email fields. This test seeds a real user + membership and
// asserts the join returns them; a base-table-only read (the pre-join behaviour)
// would leave both undefined and fail the assertions here.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { user } from "@/lib/db/schema";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("MembershipRepository.findByCollection (user join)", () => {
  let ownerId: string;
  let collectionId: string;
  let repo: MembershipRepository;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
    collectionId = await seedBareCollection(ownerId);
    repo = new MembershipRepository(getTestDb().db);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("populates each accepted member's name + email from the joined user row", async () => {
    // The owner's own name/email (from the baseline user) come through the join too.
    await repo.create({ collectionId, userId: ownerId, role: "owner" });

    const curatorId = await seedUserRow("join-curator");
    const { db } = getTestDb();
    const [curatorRow] = await db.select().from(user).where(eq(user.id, curatorId));
    await repo.create({ collectionId, userId: curatorId, role: "curator" });

    const members = await repo.findByCollection(collectionId);
    expect(members).toHaveLength(2);

    const curator = members.find((m) => m.userId === curatorId);
    expect(curator).toBeDefined();
    expect(curator!.role).toBe("curator");
    // The join populated the person-side fields the Members card renders.
    expect(curator!.name).toBe(curatorRow.name);
    expect(curator!.email).toBe(curatorRow.email);
    expect(curator!.email).toContain("@");

    const owner = members.find((m) => m.userId === ownerId);
    expect(owner).toBeDefined();
    expect(owner!.role).toBe("owner");
    expect(owner!.email).toBeTruthy();
    expect(owner!.name).toBeTruthy();
  });

  it("still returns the base membership fields (id/collectionId/userId/role) intact", async () => {
    const created = await repo.create({ collectionId, userId: ownerId, role: "owner" });

    const [member] = await repo.findByCollection(collectionId);
    expect(member.id).toBe(created.id);
    expect(member.collectionId).toBe(collectionId);
    expect(member.userId).toBe(ownerId);
    expect(member.role).toBe("owner");
  });
});
