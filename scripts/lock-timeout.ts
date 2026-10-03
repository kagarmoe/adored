import type postgres from "postgres";

// The 5s cap rides in as a connection startup parameter, but Neon drops it on BOTH
// its pooled and direct endpoints (observed 2026-10-03; local Postgres honours it).
// Verify it is live and refuse to migrate uncapped (purses-w7ss.8). On a direct,
// single-session (max: 1) connection a session SET is reliable: drizzle's migrator
// runs its transaction on that same session and inherits it. On a pooler a SET may
// bind to a different backend (one that later serves app traffic), so refuse there.
export async function ensureLockTimeout(
  sql: postgres.Sql,
  { direct }: { direct: boolean },
): Promise<"applied" | "applied-after-set"> {
  const read = async () => (await sql`select current_setting('lock_timeout') as lock_timeout`)[0]?.lock_timeout;
  if ((await read()) === "5s") return "applied";
  if (!direct) {
    throw new Error(
      "lock_timeout not applied through this pooled connection — run migrations against a direct endpoint (set POSTGRES_URL_NON_POOLING, or let the migrator derive it from a -pooler DATABASE_URL)",
    );
  }
  await sql`set lock_timeout = '5s'`;
  if ((await read()) === "5s") return "applied-after-set";
  throw new Error("lock_timeout not applied through this direct connection, even after a session SET");
}
