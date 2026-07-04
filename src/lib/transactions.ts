import type { Database } from "@/lib/db";
import { logDbError, type DbErrorContext } from "@/lib/db-error-log";
import { logDbSlow, SLOW_OP_THRESHOLD_MS } from "@/lib/db-slow-log";

// Optional labeling for the telemetry emitted at this seam. Backward-compatible:
// callers that omit it still run (timed, but the slow emit is labeled with the
// default "transaction" op, and the error path stays generic). Hot-path callers
// pass a real op + the ids they already have.
export interface TransactionOptions {
  op?: string;
  ctx?: DbErrorContext;
}

export async function withTransaction<T>(
  db: Database,
  callback: (tx: Database) => Promise<T>,
  opts?: TransactionOptions,
): Promise<T> {
  const op = opts?.op ?? "transaction";
  const ctx = opts?.ctx ?? {};
  // performance.now() deltas around the transaction — no added I/O on the
  // success path beyond the (already-async, best-effort) telemetry capture.
  const start = performance.now();
  try {
    const result = await db.transaction(async (tx: Database) => {
      return callback(tx);
    });
    // SUCCESS PATH ONLY: observe latency. A slow-but-committed tx is invisible
    // to logDbError (which only fires on failure), so surface it here. logDbSlow
    // never throws, so the result below is returned untouched.
    const ms = performance.now() - start;
    if (ms > SLOW_OP_THRESHOLD_MS) logDbSlow(op, ms, ctx);
    return result;
  } catch (err) {
    // A thrown callback (or a driver-level timeout/deadlock) rolled the tx back.
    // The ERROR path owns the emit — logDbError, NOT logDbSlow — so a failed tx
    // is never also counted as "slow". Behavior is otherwise unchanged: log a
    // breadcrumb then rethrow the original error unmodified. The caller's own
    // catch may add a richer op/ctx (e.g. the decisions route).
    logDbError(op, ctx, err);
    throw err;
  }
}
