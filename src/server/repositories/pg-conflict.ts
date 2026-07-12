// Is this error Postgres rejecting a specific unique index?
//
// MUST WALK `.cause`. drizzle 0.45 WRAPS the driver error: what it throws is a
// plain Error whose message is "Failed query: insert into ..." and whose `.cause`
// is the real PostgresError carrying `code` and `constraint_name`. Under 0.30 the
// PostgresError was thrown bare, so reading `error.code` worked — and every caller
// here did exactly that. The upgrade turned all five of them into `false`, which
// silently downgraded a gentle 409 ("you already have a sort in progress") into a
// 500, and turned two MAX+1 allocation retries into hard failures.
//
// So: match on `constraint_name` (exact, from the PostgresError) and fall back to
// the message, because the WRAPPER's message does not contain the constraint name
// — only the cause's does. src/lib/db-error-log.ts already reads `.cause.code` for
// the same reason; this is that lesson, applied where it changes behavior.
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let e: unknown = error, depth = 0; e && depth < 4; depth++) {
    const pg = e as { code?: string; constraint_name?: string; message?: string; cause?: unknown };
    if (pg.code === "23505") {
      if (pg.constraint_name) return pg.constraint_name === constraint;
      return (pg.message ?? "").includes(constraint);
    }
    e = pg.cause;
  }
  return false;
}
