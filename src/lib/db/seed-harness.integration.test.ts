// Smoke test for seedFullCollection — verifies that the shared route-test
// harness seeds exactly the rows each route integration test depends on.
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedFullCollection } from "../../../e2e/fixtures/seed";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("seedFullCollection — harness smoke test", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("seeds every cascade table with at least the expected row counts", async () => {
    const { db } = getTestDb();
    const seed = await seedFullCollection(ownerId);

    const count = (table: string, where: string) =>
      db
        .execute(sql.raw(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`))
        .then((r) => Number((r as unknown as { n: number }[])[0].n));

    const cid = seed.collectionId;

    // All ids must be non-empty strings.
    expect(seed.collectionId).toMatch(/^col_/);
    expect(seed.memberId).toMatch(/^user_/);
    expect(seed.itemAId).toMatch(/^item_/);
    expect(seed.itemBId).toMatch(/^item_/);
    expect(seed.sessionId).toMatch(/^sess_/);
    expect(seed.name).toBe("My Beloved Bags");

    // Row count assertions — non-vacuous (the seed must actually have written rows).
    expect(await count("collections", `id = '${cid}'`)).toBe(1);
    expect(await count("items", `collection_id = '${cid}'`)).toBe(2);
    // photos: 2 total (1 active + 1 soft-deleted) — count includes soft-deleted
    expect(await count("photos", `collection_id = '${cid}'`)).toBe(2);
    expect(await count("memberships", `collection_id = '${cid}'`)).toBe(1);
    expect(await count("sessions", `collection_id = '${cid}'`)).toBe(1);
    expect(
      await db
        .execute(
          sql`SELECT count(*)::int AS n FROM decision_events WHERE session_id IN (SELECT id FROM sessions WHERE collection_id = ${cid})`,
        )
        .then((r) => Number((r as unknown as { n: number }[])[0].n)),
    ).toBe(1);
    expect(await count("preferences", `collection_id = '${cid}'`)).toBe(1);
    expect(await count("sort_results", `collection_id = '${cid}'`)).toBe(2);
    expect(
      await db
        .execute(
          sql`SELECT count(*)::int AS n FROM sort_result_items WHERE sort_result_id IN (SELECT id FROM sort_results WHERE collection_id = ${cid})`,
        )
        .then((r) => Number((r as unknown as { n: number }[])[0].n)),
    ).toBe(2);
    expect(
      await db
        .execute(
          sql`SELECT count(*)::int AS n FROM sort_result_shares WHERE sort_result_id IN (SELECT id FROM sort_results WHERE collection_id = ${cid})`,
        )
        .then((r) => Number((r as unknown as { n: number }[])[0].n)),
    ).toBe(1);
    expect(await count("invitations", `collection_id = '${cid}'`)).toBe(1);
  });
});
