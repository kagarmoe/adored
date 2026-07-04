// Integration tests for the name-only profile update (purses-wew, PR1a).
// Un-mocked DB seam: real UserRepository + real Postgres; asserts persisted state
// by re-reading the row. Gated: RUN_DB_TESTS=1.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { user } from "@/lib/db/schema";
import { UserController } from "@/server/api/users";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

const TEST_USER_ID = "user_test";

describeDb("updateCurrentUser (name-only, trim/max/clear)", () => {
  beforeEach(async () => {
    await resetDb();
    const { db } = getTestDb();
    await db.insert(user).values({
      id: TEST_USER_ID,
      name: "Old",
      email: "tessa@adored.test",
    });
  });
  afterAll(async () => {
    await closeDb();
  });

  it("trims and stores a display name", async () => {
    const { db } = getTestDb();
    const u = await UserController.fromDb(db).updateCurrentUser(TEST_USER_ID, {
      name: "  Tessa  ",
    });
    expect(u.name).toBe("Tessa");
    // Re-read the persisted row to prove it was written, not just returned.
    const reread = await UserController.fromDb(db).getCurrentUser(TEST_USER_ID);
    expect(reread.name).toBe("Tessa");
  });

  it("clears the name to the email local-part when empty-after-trim (name is NOT NULL)", async () => {
    // better-auth's canonical `user.name` is NOT NULL, so a cleared name falls
    // back to the email local-part rather than storing null — keeping the
    // session header non-empty.
    const { db } = getTestDb();
    const u = await UserController.fromDb(db).updateCurrentUser(TEST_USER_ID, {
      name: "   ",
    });
    expect(u.name).toBe("tessa");
    const reread = await UserController.fromDb(db).getCurrentUser(TEST_USER_ID);
    expect(reread.name).toBe("tessa");
  });

  it("rejects an over-length name", async () => {
    const { db } = getTestDb();
    await expect(
      UserController.fromDb(db).updateCurrentUser(TEST_USER_ID, {
        name: "x".repeat(81),
      }),
    ).rejects.toThrow();
    // State unchanged: the original name persists after the rejected update.
    const reread = await UserController.fromDb(db).getCurrentUser(TEST_USER_ID);
    expect(reread.name).toBe("Old");
  });

  it("ignores an email field (name-only flow)", async () => {
    const { db } = getTestDb();
    const u = await UserController.fromDb(db).updateCurrentUser(TEST_USER_ID, {
      name: "Tessa",
      email: "evil@example.com",
    } as unknown as { name: string });
    expect(u.email).not.toBe("evil@example.com");
    const reread = await UserController.fromDb(db).getCurrentUser(TEST_USER_ID);
    expect(reread.email).toBe("tessa@adored.test");
  });
});
