import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { user } from "@/lib/db/schema";
import { BASELINE_USER, seedBaseline } from "../../../e2e/fixtures/seed";
import { TEST_DATABASE_URL, closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";

const runDbTests = process.env.RUN_DB_TESTS === "1";
const describeDb = runDbTests ? describe : describe.skip;

describeDb("e2e db fixtures", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("targets a local ephemeral postgres url", () => {
    const hostname = new URL(TEST_DATABASE_URL).hostname;
    expect(["localhost", "127.0.0.1", "::1"]).toContain(hostname);
  });

  it("seeds the baseline user into the test database", async () => {
    const seededId = await seedBaseline();
    const { db } = getTestDb();

    const rows = await db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
      })
      .from(user)
      .where(eq(user.id, seededId))
      .limit(1);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: seededId,
      email: BASELINE_USER.email,
      name: BASELINE_USER.name,
    });
  });

  it("resetDb clears previously seeded rows", async () => {
    const seededId = await seedBaseline();
    const { db } = getTestDb();

    const beforeReset = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, seededId))
      .limit(1);
    expect(beforeReset).toHaveLength(1);

    await resetDb();

    const afterReset = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, seededId))
      .limit(1);
    expect(afterReset).toHaveLength(0);
  });
});
