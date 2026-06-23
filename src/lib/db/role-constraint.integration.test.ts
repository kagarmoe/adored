// Integration tests for the 0006 migration CHECK constraint on memberships.role.
//
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { membershipsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";

vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("0006 migration — memberships_role_check constraint", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("CHECK constraint rejects INSERT with role outside {owner,curator}", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);

    // Attempt to insert a membership with an invalid role directly via Drizzle.
    await expect(
      db.insert(membershipsTable).values({
        id: generateId("mem"),
        collectionId,
        userId: ownerId,
        role: "admin" as any,
        canManageCollection: false,
        canInviteMembers: false,
        canAddItems: true,
        canDeleteItems: false,
        canEditMetadata: true,
        canAddPhotos: true,
        canDeletePhotos: false,
        canSort: true,
        canViewOutputs: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it("valid role 'owner' is accepted", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const repo = new MembershipRepository(db);

    const mem = await repo.create({
      collectionId,
      userId: ownerId,
      role: "owner",
    });
    expect(mem.role).toBe("owner");
  });

  it("valid role 'curator' is accepted", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const repo = new MembershipRepository(db);

    const mem = await repo.create({
      collectionId,
      userId: ownerId,
      role: "curator",
    });
    expect(mem.role).toBe("curator");
  });
});
