# Plan — DB performance testing + monitoring (bead purses-5dw1)

Teaching companion: `docs/teaching/database-performance.md`. Investigation finding: the timing harness (`scripts/seed-load.ts --sort`) already times the exact recompute transaction and reports p50/p95/max, but it's **local-only, manual, not in CI**; `logDbError` covers **errors, not latency**; all hot queries are index-backed; there is **no CI perf gate and no prod DB-latency signal**. This plan adds a regression gate and a latency signal without over-building. Order: monitoring first (cheapest, highest immediate value), then the benchmark, then the docs-only prod wiring.

## Global constraints
- **Preserve the PII discipline:** any new sink uses the ids-only `DbErrorContext` (no emails/tokens/SQL/params); PostHog properties are `op` + a bucketed `ms` only. Follow `logDbError` exactly.
- **No hot-path slowdown:** the slow-op timing is `performance.now()` deltas around the existing transaction — no added I/O on the success path beyond an async PostHog capture that already exists for errors.
- Standard test discipline. Don't add a heavy benchmark framework — reuse the harness's own `stats`.

## Task 1 — Slow-op sink (`db_action_slow`) — do first
Add latency telemetry at the **`withTransaction` boundary** (`src/lib/transactions.ts`) — the single seam every hot-path transaction (recompute + materialization) already flows through, and where `logDbError` is already called on failure.
- Time the transaction (`performance.now()` before/after `db.transaction(...)`). When it exceeds a threshold (start at **1000ms**, a const), emit: (a) structured `console.error("[db_slow]", JSON.stringify({ op, ms, ...ctx }))` (ids-only ctx) — captured by Vercel runtime logs, greppable like `[db_error]`; (b) a PostHog `db_action_slow` event via `getPostHogClient()`, properties `{ op, ms_bucket }` (bucket to avoid high-cardinality — e.g. `1s|2s|5s|10s|20s|30s+`), `distinctId: ctx.curatorId ?? "system"`. **Never throw** (mirror `logDbError`'s swallow-all — telemetry can't break the request).
- `withTransaction` needs an `op` + optional ids ctx to label the emit — thread a small optional param through (the decisions route passes `op:"record_decision"` + ids it already has; materialization passes `op:"materialize_result"`). Keep the signature backward-compatible (optional, defaulted).
- **Tests:** a transaction exceeding the threshold emits `[db_slow]` + the PostHog event with ids-only props (assert no PII, no SQL); under threshold emits nothing; a throwing transaction still logs the **error** path (unchanged) and never double-counts. Mock the clock/threshold.

## Task 2 — Benchmark the recompute in CI (regression gate)
Promote `seed-load --sort` from a manual tool into a baseline-comparing gate — it already computes p50/p95/max; only persistence + a compare are missing.
- Add a `bench` mode (or a thin `scripts/bench-recompute.ts` reusing the harness): seed at a fixed `--items` (e.g. 100), run the sort, write the `stats` (p50/p95/max, n) as JSON to a **committed baseline** (`bench/recompute-baseline.json`) on demand, and in check-mode **fail** if `p95` regresses beyond a tolerance (e.g. >2× baseline, or an absolute ceiling that's generous for CI noise).
- Wire a **separate, gated CI job** (like `db-tests`: needs a Postgres service, slow) in `.github/workflows/ci.yml`, triggered via the existing `changes`/paths-filter **only** when the hot path moves (`src/server/services/**`, `src/lib/insertion-ranking.ts`, `src/lib/db/**`, `scripts/seed-load.ts`). Assert on the **compare-phase p95 at items=100**.
- **The honest caveat (put it in the job output + the teaching doc):** local Docker Postgres p95 ≠ Neon prod p95. This gate catches an **algorithmic** regression (the O(N²) engine returning), NOT absolute prod latency. Set the tolerance to flag *shape* changes, not micro-noise — a loose multiplier over the committed baseline, re-baselined deliberately when the algorithm legitimately changes.

## Task 3 — Prod monitoring wiring (mostly docs + one small code option)
- **Docs (in the teaching doc / a runbook):** how to read Neon `pg_stat_statements` (enable it in Neon; the per-normalized-query mean/p95/calls view), Neon's autoscale/scale-to-zero cold-start effect on p95 tails, and Vercel Observability + function-duration (the `maxDuration=30` on the decisions route is the ceiling; a recompute trending toward it is the alarm). Grep `[db_error]`/`[db_slow]` in runtime logs for live debugging; PostHog for the durable aggregate.
- **Code option (small, worth doing):** set a **`statement_timeout`** on the postgres-js client (`src/lib/db.ts`) — generous (e.g. 25s, under the 30s function cap) — so a pathological query fails fast as SQLSTATE `57014` (already classified `statement_timeout` by `logDbError`) instead of silently eating the function budget. Test that the client carries the option; confirm it doesn't trip the normal recompute (which is tens of ms).
- **User actions (call out, not code):** enable `pg_stat_statements` in the Neon dashboard; optionally turn on Vercel Observability Plus if 30-day log retention is wanted.

## Sequencing & scope
Task 1 (slow-op sink) is the highest-value, smallest change — ship it first; it gives prod latency visibility immediately. Task 2 (benchmark gate) is a separate PR (CI + a baseline file). Task 3 is largely documentation + the one `statement_timeout` line. **Out of scope:** APM vendors, per-query tracing, a full metrics pipeline — the app's DB surface is one dominant hot path, so the sink + the gate cover the real risk without a platform.

## Done =
`test:ci` green; a transaction deliberately slowed past the threshold emits `[db_slow]` + `db_action_slow` (ids-only, proven); the bench job fails on an injected O(N²) regression and passes on the baseline; `statement_timeout` set and verified not to trip normal recomputes; the teaching doc + a short runbook point ops at Neon `pg_stat_statements` + Vercel duration.
