import type postgres from "postgres";

// The 5s cap rides in as a connection startup parameter, which a pooled URL may
// reject or drop silently. Verify it is live before migrating and refuse to migrate
// uncapped (purses-w7ss.8). No session SET fallback: under PgBouncer a SET can stick
// to a pooled backend that later serves app traffic, and on the direct host the
// startup parameter always applies — so "not applied" means "wrong URL".
export async function ensureLockTimeout(sql: postgres.Sql): Promise<"applied"> {
  const [row] = await sql`select current_setting('lock_timeout') as lock_timeout`;
  if (row?.lock_timeout === "5s") return "applied";
  throw new Error(
    "lock_timeout not applied through this connection — run migrations against the direct URL (POSTGRES_URL_NON_POOLING)",
  );
}
