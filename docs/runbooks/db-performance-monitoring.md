# Runbook — DB performance monitoring

Ops-facing. Where to look when a sort feels slow, a recompute creeps toward the
timeout, or you want to confirm the DB hot path is healthy. Teaching context
(the *why*) lives in [`../teaching/database-performance.md`](../teaching/database-performance.md);
this is the *where to click / what to grep*.

**The hot path in one line:** the dominant per-request DB cost is the sort
recompute run once per tap on `POST /api/sessions/[id]/decisions`
(`PreferenceStateService.recalculatePreferences`, under a row lock). It is
compute-bound, not index-missing. Normal recomputes are tens of ms.

---

## 1. Neon — `pg_stat_statements` (which query is slow)

The canonical "which normalized query costs the most" view: per-query call
count, total & mean execution time, rows.

- **You must enable it once** in the Neon dashboard — it is NOT on by default.
  Neon → your project → **Extensions** (or run `CREATE EXTENSION IF NOT EXISTS
  pg_stat_statements;` against the branch). It also needs
  `shared_preload_libraries`, which Neon manages when you enable the extension.
- Read it (via Neon SQL Editor or `psql` against the branch):

  ```sql
  SELECT
    calls,
    round(mean_exec_time::numeric, 1)  AS mean_ms,
    round(total_exec_time::numeric, 1) AS total_ms,
    rows,
    query
  FROM pg_stat_statements
  ORDER BY total_exec_time DESC
  LIMIT 20;
  ```

- The recompute's two writes (clear order-ranks + one bulk upsert) and the
  decision-event read are what to watch. A recompute query whose `mean_ms`
  climbs over releases is the algorithmic-regression signal (pair it with the
  advisory bench in CI).
- Reset the counters after investigating so the next window is clean:
  `SELECT pg_stat_statements_reset();`

## 2. Neon serverless — cold starts & p95 tails

Neon **autoscales** compute units and **scales to zero** when idle. A request
that hits a cold branch pays a first-query cold-start penalty. This shows up as
**p95/max tail latency**, NOT mean — a recompute that is normally tens of ms can
occasionally spike into hundreds of ms purely from cold start, with no code
change. When triaging a tail spike, rule out cold start (was the branch idle?)
before hunting a query regression.

## 3. Vercel — function duration & the timeout ceiling

- The decisions route sets **`maxDuration = 30`** (`src/app/api/sessions/[id]/decisions/route.ts`).
  That 30s is the hard ceiling. A recompute trending *toward* it is the alarm —
  it becomes an incident (a 500) once it crosses.
- **Guard rail (in code):** the postgres-js client sets
  `statement_timeout: 25000` (25s) in [`src/lib/db.ts`](../../src/lib/db.ts).
  A pathological query fails **fast** at 25s as SQLSTATE `57014` (classified
  `statement_timeout` by `logDbError`, flagged as a rolled-back write) instead
  of silently eating the full 30s function budget. Normal recomputes are ~1000×
  under this — it never trips the hot path.
- **Vercel → Observability** for per-function **duration** and **Active-CPU**.
  Watch the decisions function's duration distribution; the p95 climbing is the
  early warning.

## 4. Runtime logs vs durable aggregates

Two tiers — use the right one for the question:

- **Live / near-term debugging → Vercel runtime logs (grep).** Short retention
  (~1h Hobby / 1d Pro). Both sinks are single-line JSON with a greppable prefix:
  - `[db_error]` — a DB failure (`logDbError`): `op`, pg `code`, `class`, ids,
    `rolledBack`. IDs only, never PII.
  - `[db_slow]` — a transaction over the slow threshold (the slow-op sink at the
    `withTransaction` boundary): `op`, `ms`, ids.

  ```
  # in the Vercel log drain / CLI
  grep '\[db_slow\]'  # a recompute over threshold, with op + ms
  grep '\[db_error\]' # a DB failure, with pg code + class
  ```

- **Durable aggregate → PostHog.** Beyond Vercel's short retention:
  - `db_action_failed` — properties `op`/`code`/`class` (failure rate over time).
  - `db_action_slow` — properties `op` + a bucketed `ms` (slow-op rate over time).

  Runtime logs answer "what just happened to *this* request"; PostHog answers
  "is the failure/slow rate trending up this week".

## 5. Regression gate (pre-merge, not prod)

The advisory `bench` CI job (`scripts/bench-recompute.ts`, wired in
`.github/workflows/ci.yml`) runs the recompute at 100 items against Docker
Postgres and warns if compare-phase p95 regresses >2× over
`bench/recompute-baseline.json`. It is **advisory** — always exits 0, never
blocks merge — because local Docker p95 ≠ Neon prod p95; it catches an
**algorithmic** shape change, not absolute latency. Re-baseline deliberately
(`npm run bench:recompute -- --update-baseline`) only when the algorithm
legitimately changes.

## User actions (one-time, in the dashboards — not code)

- **Enable `pg_stat_statements`** in the Neon dashboard (§1) — required for the
  per-query view; off by default.
- **Optionally enable Vercel Observability Plus** if you want 30-day log
  retention instead of the short default (so `[db_error]`/`[db_slow]` lines
  survive longer for post-hoc debugging).
