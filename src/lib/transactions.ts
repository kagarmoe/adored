import { sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { logDbError, type DbErrorContext } from "@/lib/db-error-log";
import { logDbSlow, SLOW_OP_THRESHOLD_MS } from "@/lib/db-slow-log";

// Serialize every write that recomputes a curator's preference set for one
// collection. BOTH write paths — the decisions route and setDisposition — take
// this SAME lock inside their transaction, so a triage and a disposition for the
// same (collection, curator) can never interleave and leave an item both ranked
// AND disposed (the "impossible" state the disposed <=> untriaged invariant
// forbids). A per-session row lock was NOT enough: recalculatePreferences rewrites
// the whole (collection, curator) set from ALL the curator's sessions, and the
// route has no single-active-session guarantee, so two sessions of one curator
// could recompute concurrently. pg_advisory_xact_lock auto-releases at
// commit/rollback (no manual unlock, no leak on error). hashtext() maps each text
// id to a stable int4 in the DB, so the two-key form keys the lock on the pair
// without us hashing in JS or colliding with a single-bigint scheme.
export async function lockCollectionCurator(
  tx: Database,
  collectionId: string,
  curatorId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${collectionId}), hashtext(${curatorId}))`,
  );
}

// One idempotent save per (curator, saveKey). The single-bigint keyspace is disjoint
// from lockCollectionCurator's two-int4 one, and a holder already holds its curator
// lock and takes nothing after this, so it cannot deadlock.
export async function lockSaveKey(tx: Database, curatorId: string, saveKey: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${curatorId} || ':' || ${saveKey}, 0))`,
  );
}

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
