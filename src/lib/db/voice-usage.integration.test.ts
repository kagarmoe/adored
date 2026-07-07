// Un-mocked DB-integration proof of the per-user daily voice cap: the REAL
// recordVoiceUsage upsert against ephemeral Postgres. Pins the load-bearing cost
// control — a first call creates the (user, day) row at 1, repeats increment it,
// a different day is a separate row, and capExceeded flips once the post-increment
// count passes the cap. The route's 429 rests entirely on this.
//
// Gated by RUN_DB_TESTS (the CI `db-tests` job globs only src/lib/db); skipped
// locally without Docker — expected.
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { recordVoiceUsage } from "./voice-usage";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("recordVoiceUsage — real upsert-increment against Postgres", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    userId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("creates the (user, day) row at count 1 on the first call", async () => {
    const { db } = getTestDb();
    const result = await recordVoiceUsage(db, userId, 50, "2026-07-06");
    expect(result.count).toBe(1);
    expect(result.capExceeded).toBe(false);
  });

  it("increments the same (user, day) row on repeat calls", async () => {
    const { db } = getTestDb();
    const first = await recordVoiceUsage(db, userId, 50, "2026-07-06");
    const second = await recordVoiceUsage(db, userId, 50, "2026-07-06");
    const third = await recordVoiceUsage(db, userId, 50, "2026-07-06");
    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    expect(third.count).toBe(3);
  });

  it("counts a different day as a separate row for the same user", async () => {
    const { db } = getTestDb();
    await recordVoiceUsage(db, userId, 50, "2026-07-06");
    await recordVoiceUsage(db, userId, 50, "2026-07-06");
    const nextDay = await recordVoiceUsage(db, userId, 50, "2026-07-07");
    // A fresh day starts its own count at 1 — yesterday's total doesn't carry over.
    expect(nextDay.count).toBe(1);
  });

  it("flips capExceeded once the post-increment count passes the cap", async () => {
    const { db } = getTestDb();
    // cap = 2: counts 1 and 2 are allowed; count 3 (> cap) is over.
    const one = await recordVoiceUsage(db, userId, 2, "2026-07-06");
    const two = await recordVoiceUsage(db, userId, 2, "2026-07-06");
    const three = await recordVoiceUsage(db, userId, 2, "2026-07-06");
    expect(one.capExceeded).toBe(false);
    expect(two.capExceeded).toBe(false); // exactly at the cap — still allowed
    expect(three.capExceeded).toBe(true); // 3 > 2 — over
  });
});
