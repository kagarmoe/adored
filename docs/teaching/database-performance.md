# Teaching — Testing & Monitoring Database Performance

For an engineer strong in infrastructure/monitoring concepts but new to the **Vercel + Neon Postgres + Drizzle** specifics. Two halves that solve different problems: **testing** (catch a regression before it ships) and **monitoring** (see what's actually happening in production). You need both — the benchmark is your regression gate, the monitor is your ground truth.

## Testing vs monitoring, applied here
- **Testing = offline benchmark.** Deterministic, local Docker Postgres, *you* drive the load and read the numbers. Catches **algorithmic** regressions (someone reintroduces an O(N²) path) before merge. Cannot see production — a local cold Postgres is not Neon under a serverless function.
- **Monitoring = live telemetry.** Real Neon-over-Vercel behavior, but only *after* it ships. Today DB errors and slow transactions are visible in structured runtime logs; aggregate retention depends on the Vercel log/observability pipeline.

The gap this closes: right now a recompute that silently doubles in cost ships green (no benchmark) and runs unseen in prod (no slow-op signal) until it crosses the timeout and becomes an *error* — which is the incident, not the warning.

## The bottleneck story for THIS app (know the enemy before measuring it)
The dominant per-request DB cost is the **sort recompute**, run once per tap on `POST /api/sessions/[id]/decisions`:
1. The route takes a `SELECT … FOR UPDATE` lock on the session row (serializes a curator's concurrent taps), then inserts the decision event, then calls `recalculatePreferences`.
2. `PreferenceStateService.recalculatePreferences` re-derives **everything from the full decision log, every tap**: read all the curator's decision events → score them → run the binary-insertion engine `deriveOrder` over the rankable items → clear order-ranks and write them back in **one bulk upsert** (2 statements, not ~2N).
3. The engine is roughly **O(N·log N·C)**: `deriveOrder` places each of N items with a binary search, and each placement's `latestOutcome` **linearly scans all comparisons** (C). Comparisons accumulate ~N·log N over a full sort — so **recomputes get more expensive as the sort progresses**, and the whole thing scales with collection size.

Two consequences for how you measure it:
- **Time the whole transaction, not individual queries.** The cost is the in-memory engine plus the two writes, under a lock — so the meaningful unit is the `withTransaction(...) recalculatePreferences(...)` block, exactly what the harness brackets.
- **The write was already optimized once.** It went from ~2N awaited round-trips to 2 statements after a real *timeout-and-rollback* incident (the code comment records it). The write is now cheap; **the next regression risk is algorithmic** (the engine), which is precisely what a benchmark catches and a slow-op monitor flags.

Indexes are not the bottleneck: every hot read/write is index-backed — `preferences_(collection,curator)` for the read/clear, the `(item,curator)` unique as the upsert conflict target, `decision_events_(session)` for the event read, and the partial-unique `order_rank` index forcing the clear-then-upsert pattern. The one query that *could* seq-scan (the pool preview) was `EXPLAIN`-checked on a 5000-row DB and deliberately left bounded by `LIMIT`. So this is a **compute-bound** hot path, not an index-missing one.

## What's already wired (and what it does *not* measure)
- **The timing harness** — `scripts/seed-load.ts --sort` (`npm run seed:load -- --items=100 --sort`). It plays a whole sort and brackets `performance.now()` around the same `withTransaction`/`recalculatePreferences` unit the route runs, reporting `n / total / mean / p50 / p95 / max` per phase. But: **local-Docker-only** (a hard localhost guard — it *cannot* point at Neon), **manual** (console output, no stored baseline, no pass/fail), and **not in CI**.
- **`logDbError`** — structured `console.error("[db_error]", …)`. **Errors only, no latency.** Its context type is **ids-only by construction** (`collectionId/curatorId/sessionId/itemId`) — you *cannot* pass an email/token.
- **`DB_QUERY_LOG=1`** — Drizzle's dev-only query logger (SQL + param values; off by default, never in prod). Shows *what* runs, never *how long*.
- **Vercel `SpeedInsights` + `Analytics`** — already in the root layout, but these are **client-side Web Vitals / page traffic**, not DB latency. Easy to mistake for DB monitoring; it isn't.
- **No** `pg_stat_statements` config, **no** `statement_timeout` on the postgres-js client, **no** DB-perf dashboard.

## The two things worth building (details in the plan)
1. **A benchmark that fails CI on algorithmic regression.** The harness already computes p50/p95/max — it's missing only *persistence + a threshold compare*. Store a baseline, add a `bench` script that fails if `p95 @ items=100` regresses beyond a tolerance, run it in a **separate, gated CI job** (it needs Postgres and is slow, like the `db-tests` job) triggered only when the hot-path files change. **Honest caveat, state it in the doc:** local Docker p95 ≠ Neon prod p95 — this gate catches the *shape* regression (O(N²) came back), not absolute production latency.
2. **A slow-op sink.** Mirror `logDbError` at the `withTransaction` boundary — time the transaction, and when it exceeds a threshold (e.g. 1s), emit `[db_slow]` structured console with the same ids-only context. **One edit** covers the recompute *and* the materialization, because every hot-path transaction flows through `withTransaction`. This is the warning the timeout incident lacked.

## The production surfaces (what to point ops at)
> Ops-facing quick reference (where to click / what to grep): [`../runbooks/db-performance-monitoring.md`](../runbooks/db-performance-monitoring.md).

- **Neon (your Postgres):** `pg_stat_statements` is the canonical "which query is slow" view — per-normalized-query call count, total & mean execution time, rows. Plus Neon's serverless model: **autoscaling compute units**, **scale-to-zero** (a cold branch adds first-query latency — relevant to p95 tails), and branchable databases. This is the closest to your infra instincts: it's just Postgres, with the standard stats extension.
- **Vercel:** per-function **duration** (the `maxDuration = 30` on the decisions route is the ceiling to watch — a recompute creeping toward it is the alarm), **Active-CPU** as the Fluid-Compute cost dimension, **Observability** dashboards, and **runtime logs** (short retention, ~1h Hobby / 1d Pro — so `[db_error]`/`[db_slow]` lines are for live/near-term debugging unless routed to longer-retention logging).
- **Consider a `statement_timeout`** on the postgres-js client so a pathological query fails *fast* (surfacing as SQLSTATE `57014`, which `logDbError` already classifies as `statement_timeout`) instead of silently eating the 30s function budget.

## Snippets (real code)
**The timing unit** — times exactly what the route runs (`scripts/seed-load.ts`):
```ts
async function timedRecompute(db, collectionId, curatorId): Promise<number> {
  const t0 = performance.now();
  await withTransaction(db, async (tx) => {
    await PreferenceController.fromDb(tx).recalculatePreferences(collectionId, curatorId);
  });
  return performance.now() - t0;   // the whole locked transaction, not a single query
}
```
**The shape a slow-op sink mirrors** (`src/lib/db-error-log.ts`):
```ts
console.error("[db_error]", JSON.stringify({ op, code, class: errClass, ...ctx, message, rolledBack }));
```
A `[db_slow]` sink copies this into `src/lib/transactions.ts` with `{ op, ms }`.

## Files
`scripts/seed-load.ts` (harness), `src/lib/transactions.ts` (the one slow-op seam), `src/lib/db-error-log.ts` (the mirror), `src/lib/db.ts` (client — where a `statement_timeout` would go), `src/server/services/PreferenceStateService.ts` + `src/lib/insertion-ranking.ts` (the hot path), `src/lib/db/schema.ts` (indexes), `.github/workflows/ci.yml` (where a bench job slots), `src/app/api/sessions/[id]/decisions/route.ts` (`maxDuration`).
