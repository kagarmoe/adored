import type { DbErrorContext } from "@/lib/db-error-log";

// Production DB LATENCY sink — the success-path mirror of logDbError. Where
// logDbError observes a failed transaction, logDbSlow observes a slow one: a
// transaction that committed fine but took too long. It only OBSERVES through a
// structured Vercel log; it never handles, slows, or breaks the request. Emitted
// from the withTransaction seam every hot-path tx flows through (recompute +
// results materialization).

// Slow if a transaction takes longer than this. A generous floor so normal
// recomputes (tens of ms) never trip it — only pathological latency surfaces.
export const SLOW_OP_THRESHOLD_MS = 1000;

// Coarse buckets are retained for callers/tests that need stable latency bands.
// Each bucket is the lower bound of its range: [1s,2s)→"1s", [2s,5s)→"2s",
// … , [30s,∞)→"30s+".
export function bucketMs(ms: number): string {
  if (ms < 2000) return "1s";
  if (ms < 5000) return "2s";
  if (ms < 10000) return "5s";
  if (ms < 20000) return "10s";
  if (ms < 30000) return "20s";
  return "30s+";
}

export function logDbSlow(op: string, ms: number, ctx: DbErrorContext): void {
  // MUST NEVER THROW: telemetry can't be allowed to break or slow the request.
  // Everything below is wrapped so logDbSlow only ever observes — the caller's
  // result/error is unaffected.
  try {
    // Greppable prefix + a single JSON payload, searchable in Vercel runtime
    // logs by "[db_slow]" like "[db_error]". IDS ONLY (ctx is DbErrorContext) —
    // never PII, never SQL, never params.
    console.error("[db_slow]", JSON.stringify({ op, ms, ...ctx }));
  } catch {
    // Swallow: the telemetry path is best-effort observation.
  }
}
