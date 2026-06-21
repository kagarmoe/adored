# Coverage Phase 0 — "Make coverage honest" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the coverage number reflect both test tiers (unit + DB-integration) and add a CI floor that blocks regressions.

**Architecture:** Both CI jobs emit v8 `coverage-final.json`; a new merge job downloads both artifacts and runs an `istanbul-lib-coverage` union-merge script that prints the combined total and fails if it's below a floor. The floor lives in the merge job, never in `vitest.config` (the unit-only `gate` job would fail it).

**Tech Stack:** vitest 1.6.1 + `@vitest/coverage-v8` 1.6.1 (v8 provider), `istanbul-lib-coverage` 3.2.2 (already installed), GitHub Actions, `esbuild-register` (existing script runner).

## Global Constraints

- vitest is **1.6.1** — it has **no** `--merge-reports` / `blob` reporter (those are 2.x). Merge is `istanbul-lib-coverage` over `coverage-final.json`. Do not use `--merge-reports`.
- Merge is a **union** of hit counts (a line covered in either tier counts once), never a sum.
- The floor is asserted in the **merge job**; `vitest.config` thresholds are NOT used.
- Both tiers must use `coverage.include: ["src/**"]` and emit `coverage-final.json` with the same path base.
- Scripts run via `node -r esbuild-register scripts/<x>.ts` (see `package.json:19` `db:migrate`).
- Branch `feat/test-coverage-initiative`; feature branch → PR → squash-merge. Never commit to `main`.

---

### Task 1: Coverage-merge script (tested module)

**Files:**
- Create: `scripts/coverage-merge.ts`
- Test: `scripts/coverage-merge.test.ts`

**Interfaces:**
- Produces: `mergeCoverageData(datas: CoverageMapData[]): CoverageSummaryJSON` (union summary with `{lines,statements,functions,branches}` each `{total,covered,skipped,pct}`); `mergeCoverageFiles(paths: string[]): CoverageSummaryJSON`; a CLI `main()` that takes `--floor <pct>` + paths, prints the summary, and `process.exit(1)` if `lines.pct < floor`.

- [ ] **Step 1: Write the failing test** — `scripts/coverage-merge.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { mergeCoverageData } from "./coverage-merge";

// Minimal istanbul fileCoverage for a 3-statement file; `s` = per-statement hit counts.
const fileCov = (s: Record<number, number>) => ({
  path: "/x.ts",
  statementMap: {
    0: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
    1: { start: { line: 2, column: 0 }, end: { line: 2, column: 1 } },
    2: { start: { line: 3, column: 0 }, end: { line: 3, column: 1 } },
  },
  fnMap: {}, branchMap: {}, s, f: {}, b: {},
});

describe("mergeCoverageData", () => {
  it("unions hit counts across tiers — a line covered in EITHER tier counts", () => {
    const tierA = { "/x.ts": fileCov({ 0: 1, 1: 0, 2: 0 }) }; // line 1 only
    const tierB = { "/x.ts": fileCov({ 0: 0, 1: 1, 2: 1 }) }; // lines 2,3
    const merged = mergeCoverageData([tierA as any, tierB as any]);
    expect(merged.lines.covered).toBe(3); // union of both tiers
    expect(merged.lines.total).toBe(3);
    expect(merged.lines.pct).toBe(100);
  });

  it("does NOT sum/inflate when the same file runs in both tiers", () => {
    const same = { "/x.ts": fileCov({ 0: 1, 1: 1, 2: 0 }) }; // 2 of 3
    const merged = mergeCoverageData([same as any, same as any]);
    expect(merged.lines.covered).toBe(2); // union, not 4
    expect(merged.lines.total).toBe(3);
  });
});
```

- [ ] **Step 2: Run it — verify it fails** — `npx vitest run scripts/coverage-merge.test.ts` → FAIL ("Failed to resolve import ./coverage-merge").

- [ ] **Step 3: Implement** — `scripts/coverage-merge.ts`

```ts
import libCoverage, { type CoverageMapData, type CoverageSummaryData } from "istanbul-lib-coverage";
import { readFileSync } from "node:fs";

/** Union-merge any number of coverage datasets into one total summary. */
export function mergeCoverageData(datas: CoverageMapData[]): CoverageSummaryData {
  const map = libCoverage.createCoverageMap({});
  for (const d of datas) map.merge(d);
  const summary = libCoverage.createCoverageSummary();
  for (const f of map.files()) summary.merge(map.fileCoverageFor(f).toSummary());
  return summary.toJSON();
}

export function mergeCoverageFiles(paths: string[]): CoverageSummaryData {
  return mergeCoverageData(paths.map((p) => JSON.parse(readFileSync(p, "utf8")) as CoverageMapData));
}

function main(): void {
  const args = process.argv.slice(2);
  const fi = args.indexOf("--floor");
  const floor = fi >= 0 ? Number(args[fi + 1]) : 0;
  const paths = args.filter((a, i) => a !== "--floor" && args[i - 1] !== "--floor");
  if (paths.length === 0) throw new Error("usage: coverage-merge [--floor <pct>] <coverage-final.json...>");
  const s = mergeCoverageFiles(paths);
  console.log(
    `Merged coverage — lines ${s.lines.pct}% (${s.lines.covered}/${s.lines.total}), ` +
      `statements ${s.statements.pct}%, functions ${s.functions.pct}%, branches ${s.branches.pct}%`,
  );
  if (s.lines.pct < floor) {
    console.error(`::error::Merged line coverage ${s.lines.pct}% is below floor ${floor}%`);
    process.exit(1);
  }
}

// esbuild-register compiles to CJS, so require.main === module holds for the CLI entry.
if (require.main === module) main();
```

- [ ] **Step 4: Run the test — verify it passes** — `npx vitest run scripts/coverage-merge.test.ts` → 2 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/coverage-merge.ts scripts/coverage-merge.test.ts
git commit -m "feat(coverage): istanbul union-merge script for unit+integration coverage"
```

---

### Task 2: Emit `coverage-final.json` from vitest

**Files:**
- Modify: `vitest.config.mts:20` (coverage.reporter)
- Modify: `.gitignore` (ignore the per-tier dirs)

**Interfaces:**
- Consumes: nothing. Produces: `coverage/coverage-final.json` on every `--coverage` run (the merge script's input shape).

- [ ] **Step 1: Add the `json` reporter** — `vitest.config.mts:20`, change the reporter array to include `"json"`:

```ts
      reporter: ["text-summary", "json-summary", "json", "html"],
```

- [ ] **Step 2: Ignore per-tier coverage dirs** — append to `.gitignore`:

```
/coverage-unit/
/coverage-db/
```

- [ ] **Step 3: Verify the file is emitted** — `npx vitest run --coverage src/lib/id.test.ts` then `test -f coverage/coverage-final.json && echo OK` → `OK`.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.mts .gitignore
git commit -m "chore(coverage): emit coverage-final.json (json reporter) for merging"
```

---

### Task 3: Measure the merged baseline locally (sets the floor)

**Files:** none (measurement only). **Requires Docker** (the integration tier).

- [ ] **Step 1: Unit-tier coverage** →

```bash
npx vitest run --coverage --coverage.reporter=json --coverage.reportsDirectory=coverage-unit
```

- [ ] **Step 2: Integration-tier coverage** (Docker Postgres on :5433 via the harness) →

```bash
bash e2e/fixtures/test-db.sh up
RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db \
  --coverage --coverage.reporter=json --coverage.reportsDirectory=coverage-db
bash e2e/fixtures/test-db.sh down
```

- [ ] **Step 3: Merge + read the number** →

```bash
node -r esbuild-register scripts/coverage-merge.ts coverage-unit/coverage-final.json coverage-db/coverage-final.json
```

Expected: a `Merged coverage — lines NN%` line where **NN is meaningfully above the unit-only 54%** (the repo layer now counts). Record NN.

- [ ] **Step 4: Choose the floor** — `FLOOR = floor(NN) - 1` (1-point slack for nondeterminism). Note it for Tasks 4–5. No commit (measurement only).

---

### Task 4: Wire CI — per-tier coverage artifacts + merge job

**Files:**
- Modify: `.github/workflows/ci.yml` (db-tests step `:97-100`; gate upload `:43-49`; add a `coverage` job after `db-tests`)

**Interfaces:**
- Consumes: `scripts/coverage-merge.ts` (Task 1), `coverage-final.json` from both tiers (Task 2). Produces: a required-able `coverage` job that fails below `FLOOR`.

- [ ] **Step 1: db-tests emits + uploads coverage** — replace the `DB tests (serial)` step (`ci.yml:97-100`) with a coverage run, and add an upload after it:

```yaml
      - name: DB tests (serial, with coverage)
        run: >-
          RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db
          --coverage --coverage.reporter=json --coverage.reportsDirectory=coverage-db
        env:
          DATABASE_URL_TEST: postgresql://postgres:test@localhost:5432/app_test

      - name: Upload DB coverage
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v7
        with:
          name: coverage-db
          path: coverage-db/
          retention-days: 7
```

- [ ] **Step 2: gate uploads its coverage-final.json** — the gate already uploads `coverage/` as `coverage-report` (`ci.yml:43-49`); with Task 2 it now contains `coverage-final.json`. No change needed (confirm the artifact name `coverage-report`).

- [ ] **Step 3: Add the merge+floor job** — append to `ci.yml` jobs (use the `FLOOR` from Task 3, e.g. `70`):

```yaml
  coverage:
    name: Merged coverage floor
    runs-on: ubuntu-latest
    needs: [gate, db-tests]
    if: ${{ !cancelled() }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - uses: actions/download-artifact@v7
        with: { name: coverage-report, path: coverage-unit }
      - uses: actions/download-artifact@v7
        with: { name: coverage-db, path: coverage-db }
      - name: Merge coverage + enforce floor
        run: >-
          node -r esbuild-register scripts/coverage-merge.ts --floor <FLOOR>
          coverage-unit/coverage-final.json coverage-db/coverage-final.json
```

- [ ] **Step 4: Validate the workflow YAML** — `npx --yes @action-validator/cli .github/workflows/ci.yml` if available, else `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(coverage): merge unit+integration coverage in a floor-gated job"
```

---

### Task 5: Document + sync, then open the PR

**Files:**
- Modify: `docs/ARCHITECTURE.md` (a decision entry: coverage is the union of unit + integration, floor-gated in the `coverage` job)

- [ ] **Step 1: Record the decision** in `docs/ARCHITECTURE.md` (one entry): the 54% was unit-only; coverage is now the istanbul union-merge of the `gate` + `db-tests` tiers, computed in the `coverage` job, floor `<FLOOR>%`, ratcheted per phase. Note vitest 1.6.1 lacks `--merge-reports`.

- [ ] **Step 2: Run the local gates** — `npm run test:ci` (unit incl. the merge-script test), `npm run lint`, `npm run build` (dummy env). Expected: green.

- [ ] **Step 3: Commit + push + PR**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs(arch): coverage = union of unit+integration tiers, floor-gated"
git push -u origin feat/test-coverage-initiative
gh pr create --base main --title "ci(coverage): make coverage honest — merge unit+integration + floor" --body "<summary>"
```

- [ ] **Step 4: Confirm on CI** — the new `coverage` job runs, downloads both artifacts, prints the merged total, and the floor check passes. Merge when green.

---

## Verification

- **Merge script:** `npx vitest run scripts/coverage-merge.test.ts` (union behavior, no double-count).
- **Local merged baseline:** Task 3 commands (Docker) print the real combined number; confirm it exceeds 54% and `src/server/repositories` coverage now appears.
- **Floor gate:** temporarily pass `--floor 100` locally → the script exits 1 (proves the gate bites); revert.
- **CI end-to-end:** on the PR, the `coverage` job consumes both artifacts and reports/enforces the merged total.

## Self-review notes

- Spec coverage: instrument db-tests (Task 4.1), merge via istanbul-lib-coverage (Task 1), threshold in merge job not vitest.config (Task 4.3 + Global Constraints), json reporter (Task 2), artifact transport (Task 4.1–4.3), union-not-sum (Task 1 test 2) — all present.
- `<FLOOR>` is a data-derived value produced by Task 3 (a formula, not an open TODO).
- No coverage of the connectivity test / route tests here — those are Phases 1–3 (separate plans).
</content>
