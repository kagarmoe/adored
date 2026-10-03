import type postgres from "postgres";

// The migrator runs at vercel-build on the pooled DATABASE_URL; PgBouncer may drop
// a startup parameter silently. Verify the cap is live before migrating, and refuse
// to migrate uncapped (purses-w7ss.8). Under PgBouncer transaction pooling a session
// SET can land on a different backend than the migration transaction, so
// "applied-after-set" is only trustworthy on a session-mode or direct connection —
// if prod logs it on the pooled URL, point db:migrate at the direct URL.
export async function ensureLockTimeout(sql: postgres.Sql): Promise<"applied" | "applied-after-set"> {
  const read = async () => (await sql`select current_setting('lock_timeout') as lock_timeout`)[0]?.lock_timeout;
  if ((await read()) === "5s") return "applied";
  await sql`set lock_timeout = '5s'`;
  if ((await read()) === "5s") return "applied-after-set";
  throw new Error("lock_timeout not applied through this connection — run migrations against the direct URL");
}
