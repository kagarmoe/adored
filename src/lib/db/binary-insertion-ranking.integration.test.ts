import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb, resetDb, closeDb } from "@/../e2e/fixtures/db";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("binary-insertion ranking — schema", () => {
  beforeAll(async () => { await resetDb(); });
  afterAll(async () => { await closeDb(); });

  it("preferences has a nullable order_rank column", async () => {
    const { db } = getTestDb();
    const rows = await db.execute(sql`
      select column_name, is_nullable from information_schema.columns
      where table_name = 'preferences' and column_name = 'order_rank'`);
    expect(rows.length).toBe(1);
    expect((rows[0] as { is_nullable: string }).is_nullable).toBe("YES");
  });

  it("decision_events has a nullable client_key column", async () => {
    const { db } = getTestDb();
    const rows = await db.execute(sql`
      select column_name, is_nullable from information_schema.columns
      where table_name = 'decision_events' and column_name = 'client_key'`);
    expect(rows.length).toBe(1);
    expect((rows[0] as { is_nullable: string }).is_nullable).toBe("YES");
  });

  it("enforces the partial unique index on (session_id, client_key)", async () => {
    const { db } = getTestDb();
    const rows = await db.execute(sql`
      select indexname from pg_indexes
      where tablename = 'decision_events' and indexname = 'decision_events_client_key_unique'`);
    expect(rows.length).toBe(1);
  });
});
