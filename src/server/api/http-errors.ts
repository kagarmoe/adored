import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth";
import {
  DeleteResultStateError,
  SupersedeStateError,
  FinalizeStateError,
  ReorderFinalizedError,
  ResultItemNotInResultError,
  PinTargetError,
} from "@/server/services/SortResultService";
import { CurrentSessionExistsError } from "@/server/repositories/implementations/SessionRepository";
import { PreferenceExistsError } from "@/server/api/dispositions";
import { PoolGroupError } from "@/server/services/ItemService";
import { ItemInResultError } from "@/server/services/ItemPurgeService";
import { InvitationAcceptError } from "@/server/services/InvitationAcceptService";

/**
 * Carries its own HTTP status. For call sites that need a status the domain
 * errors below don't express (route-level auth/validation short-circuits).
 */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Shared error-to-HTTP-response mapper for API route handlers.
 *
 * Maps well-known error types to their canonical HTTP status codes so every
 * route returns consistent, correct responses without duplicated catch logic.
 * Routes should call this in their catch block and return the result directly.
 *
 * Mapping:
 *   SyntaxError              → 400 "Invalid JSON"
 *   ZodError                 → 400 "Invalid input" + flatten details
 *   DeleteResultStateError
 *   | SupersedeStateError
 *   | FinalizeStateError
 *   | ReorderFinalizedError
 *   | CurrentSessionExistsError → 409 (error.message)
 *   | PreferenceExistsError
 *   | ItemInResultError       → 409 (error.message)
 *   PoolGroupError            → 409 if code "conflict", else 400 (error.message)
 *   HttpError
 *   | InvitationAcceptError   → error.status (error.message)
 *   ResultItemNotInResultError → 404 (error.message)
 *   PinTargetError → 404 (error.message)
 *   UnauthorizedError
 *   | Error("Unauthorized")  → 401
 *   anything else            → 500 "Something went wrong. Please try again." + errorId
 *                              (full structured error logged server-side as [api_error],
 *                              keyed by that errorId; never echoed except locally)
 *
 * The messages echoed above are curated copy authored on the typed error itself,
 * never driver text — which is why this is the ONLY place allowed to read
 * error.message (enforced by the no-restricted-syntax rule on src/app/api).
 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid input", details: error.flatten() },
      { status: 400 },
    );
  }
  if (
    error instanceof DeleteResultStateError ||
    error instanceof SupersedeStateError ||
    error instanceof FinalizeStateError ||
    error instanceof ReorderFinalizedError ||
    error instanceof CurrentSessionExistsError ||
    error instanceof PreferenceExistsError ||
    error instanceof ItemInResultError
  ) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof PoolGroupError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "conflict" ? 409 : 400 },
    );
  }
  if (error instanceof HttpError || error instanceof InvitationAcceptError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ResultItemNotInResultError || error instanceof PinTargetError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (
    error instanceof UnauthorizedError ||
    (error instanceof Error && error.message === "Unauthorized")
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Unmapped errors carry driver text (relation names, constraint names, sometimes
  // column values). ALL of it goes to the server log, keyed by an errorId the caller
  // also gets, so a developer with a failing request can find the exact log line —
  // strictly more useful than echoing one raw message string (purses-hiez).
  const errorId = crypto.randomUUID();
  const detail = describeError(error);
  // Same greppable-prefix + one-JSON-payload shape as [db_error] (src/lib/db-error-log.ts)
  // so both are searchable the same way in Vercel runtime logs. This replaces the old
  // console.error 1:1 — the routes
  // that deliberately don't log (sessions decisions/batch) still log exactly once, here.
  console.error("[api_error]", JSON.stringify({ errorId, error: detail }));
  return NextResponse.json(
    {
      error: "Something went wrong. Please try again.",
      errorId,
      // LOCAL ONLY. NODE_ENV — never VERCEL_ENV: Vercel sets NODE_ENV=production for
      // PREVIEW deploys too, and preview URLs are internet-reachable and get shared,
      // so a VERCEL_ENV gate would leak driver text on every preview.
      ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
    },
    { status: 500 },
  );
}

// The fields postgres-js actually populates on a PostgresError: it Object.assigns the
// parsed ErrorResponse onto the Error (node_modules/postgres/src/connection.js
// `errorFields`). Verified against the installed driver — not invented. Deliberately
// omits `query`/`parameters` (they carry user values → PII).
const PG_ERROR_FIELDS = [
  "code",
  "severity",
  "severity_local",
  "detail",
  "hint",
  "position",
  "internal_position",
  "internal_query",
  "where",
  "schema_name",
  "table_name",
  "column_name",
  "constraint_name",
  "file",
  "line",
  "routine",
] as const;

/**
 * Everything extractable from an unknown throwable, as a JSON-serializable record.
 *
 * name/message/stack are read EXPLICITLY because they are non-enumerable: a naive
 * JSON.stringify(error) serializes to "{}" and loses the entire error. `cause` is
 * unwrapped recursively — drizzle/postgres wrap the real driver error underneath.
 */
function describeError(error: unknown, depth = 0): Record<string, unknown> {
  if (!(error instanceof Error)) return { value: String(error) };
  const e = error as Error & Record<string, unknown>;
  const detail: Record<string, unknown> = {
    name: e.name,
    message: e.message,
    stack: e.stack,
  };
  for (const field of PG_ERROR_FIELDS) {
    if (e[field] !== undefined) detail[field] = e[field];
  }
  // Depth cap: a self-referential cause chain must not spin forever.
  if (e.cause !== undefined && depth < 4) detail.cause = describeError(e.cause, depth + 1);
  return detail;
}
