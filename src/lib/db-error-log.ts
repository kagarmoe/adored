// Production DB failure sink. Motivated by the compare-save bug: a transaction
// rolled back on timeout, the route returned 500, but nothing logged WHY — no
// server breadcrumb. logDbError OBSERVES a DB failure through structured Vercel
// logs; it never handles or swallows it. The caller still throws/500s exactly as
// before.

// The pg error codes we classify. Everything else is "unknown".
export type DbErrorClass =
  | "unique"
  | "statement_timeout"
  | "deadlock"
  | "serialization_failure"
  | "connection"
  | "unknown";

// ctx is IDS ONLY, by TYPE. This is the PII guardrail: the shape makes it
// impossible to pass an email, token, or arbitrary value — only these opaque,
// non-PII identifiers are accepted, so a caller can't accidentally log a query
// param or user value. Widen deliberately (a reviewed amendment), never ad hoc.
export interface DbErrorContext {
  collectionId?: string;
  curatorId?: string;
  sessionId?: string;
  itemId?: string;
  resultId?: string;
}

// A pg error surfaces its code at .code or, when wrapped by the driver/drizzle,
// at .cause.code — read both (the isUniqueViolation pattern generalized).
function readPgCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

export function classifyDbError(error: unknown): DbErrorClass {
  const code = readPgCode(error);
  if (!code) return "unknown";
  switch (code) {
    case "23505":
      return "unique";
    case "57014":
      return "statement_timeout";
    case "40P01":
      return "deadlock";
    case "40001":
      return "serialization_failure";
  }
  // 08xxx is the connection-exception class (08006, 08003, 08001, ...).
  if (code.startsWith("08")) return "connection";
  return "unknown";
}

export function logDbError(op: string, ctx: DbErrorContext, error: unknown): void {
  // MUST NEVER THROW: a logging failure can't be allowed to mask or replace the
  // caller's real DB error. Everything below is wrapped so logDbError only ever
  // observes — the caller keeps control of the original error.
  try {
    const code = readPgCode(error);
    const errClass = classifyDbError(error);
    const message = error instanceof Error ? error.message : String(error);
    // A timeout aborted the statement mid-transaction → the tx rolled back and
    // the caller's write was silently lost. Flag it so it's obvious in the log.
    const rolledBack = errClass === "statement_timeout";

    // Greppable prefix + a single JSON payload so it's searchable in Vercel
    // runtime logs (by "[db_error]" or by any field). IDS ONLY — never PII.
    console.error(
      "[db_error]",
      JSON.stringify({ op, code, class: errClass, ...ctx, message, rolledBack }),
    );
  } catch {
    // Swallow: the logging path is best-effort observation. The caller's error
    // handling (throw / 500) is unaffected.
  }
}
