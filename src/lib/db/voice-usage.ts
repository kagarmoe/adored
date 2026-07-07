import { sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { voiceUsageTable } from "@/lib/db/schema";

// Cost control for the paid /api/voice/extract endpoint. One row per (user, day),
// upsert-incremented per call; `capExceeded` is true once the post-increment count
// passes the cap. A hostile authenticated user gets at most `cap` calls per day.
// Lives here (not in the route) so the CI `db-tests` job — which globs only
// src/lib/db — can exercise the real upsert against ephemeral Postgres, un-mocked.

export interface VoiceUsageResult {
  /** The post-increment call count for this (user, day). */
  count: number;
  /** True when `count` has passed `cap` — the route rejects with 429. */
  capExceeded: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// `day` is injectable for tests (distinct days = distinct rows); production uses
// today() so a call is always counted against the current UTC day.
export async function recordVoiceUsage(
  db: Database,
  userId: string,
  cap: number,
  day: string = today(),
): Promise<VoiceUsageResult> {
  const [row] = await db
    .insert(voiceUsageTable)
    .values({ userId, day, count: 1 })
    .onConflictDoUpdate({
      target: [voiceUsageTable.userId, voiceUsageTable.day],
      set: { count: sql`${voiceUsageTable.count} + 1` },
    })
    .returning({ count: voiceUsageTable.count });
  return { count: row.count, capExceeded: row.count > cap };
}
