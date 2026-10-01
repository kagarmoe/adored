# Coverage Phase 0 — "Make coverage honest" (vitest 4 native merge)

> **For agentic workers:** execute task-by-task; each ends green. Steps use `- [ ]`.

**Goal:** Make the published coverage number the **union** of the unit + DB-integration tiers, and add a CI floor that blocks regressions.

**Architecture:** On vitest 4 (merged in #229), each CI tier runs `--coverage --reporter=blob` and uploads its blob; a merge job runs `vitest --merge-reports --coverage` to recompute union coverage, enforces the floor via `--coverage.thresholds.lines`, and uploads the merged `coverage/` for the gh-pages dashboard. **No custom merge script** (the istanbul approach is removed).

**Verified locally:** unit 50.05% + db 23.5% → **merged 60.76% lines**.

## Global Constraints
- vitest **4.1.9**; native `--reporter=blob` + `--merge-reports` (do not reintroduce istanbul).
- The floor is enforced ONLY on the merge run (`--coverage.thresholds.lines=<floor>`), never in `vitest.config` (would fail the per-tier blob runs).
- Both tiers share `coverage.include:["src/**"]` (already in `vitest.config.mts`).
- Branch `feat/test-coverage-initiative`; feature branch → PR → squash-merge. Never commit to `main`.
- Floor for this PR: **60** (just under the verified 60.76; ratchets up in later phases).

---

### Task 1: Per-tier blob coverage + artifacts

**Files:** `.github/workflows/ci.yml` (gate step ~38-49; db-tests step ~97-100)

- [ ] **gate** — emit a blob and replace its `coverage/` upload with a blob upload:
```yaml
      - name: Unit tests (coverage → blob)
        run: npm run test:ci -- --coverage --reporter=blob --outputFile=.vitest-reports/blob-unit.json
      - name: Upload unit coverage blob
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v7
        with: { name: blob-unit, path: .vitest-reports/blob-unit.json, retention-days: 7 }
```
- [ ] **db-tests** — add coverage+blob to the run and upload it:
```yaml
      - name: DB tests (serial, coverage → blob)
        run: >-
          RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db
          --coverage --reporter=blob --outputFile=.vitest-reports/blob-db.json
        env:
          DATABASE_URL_TEST: postgresql://postgres:test@localhost:5432/app_test
      - name: Upload DB coverage blob
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v7
        with: { name: blob-db, path: .vitest-reports/blob-db.json, retention-days: 7 }
```
- [ ] **Verify** YAML parses: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK`.
- [ ] **Commit:** `ci(coverage): per-tier blob coverage + artifacts`

### Task 2: Merge job (union coverage + floor)

**Files:** `.github/workflows/ci.yml` (new `coverage` job)

- [ ] Append a job that merges both blobs, enforces the floor, and produces the dashboard report:
```yaml
  coverage:
    name: Merged coverage floor
    runs-on: ubuntu-latest
    needs: [gate, db-tests]
    if: ${{ !cancelled() && needs.gate.result == 'success' && needs.db-tests.result == 'success' }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - uses: actions/download-artifact@v7
        with: { name: blob-unit, path: .vitest-reports }
      - uses: actions/download-artifact@v7
        with: { name: blob-db, path: .vitest-reports }
      - name: Merge coverage + enforce floor
        run: >-
          npx vitest --merge-reports
          --coverage --coverage.reporter=json-summary --coverage.reporter=text-summary --coverage.reporter=html
          --coverage.thresholds.lines=60
      - name: Upload merged coverage (dashboard)
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v7
        with: { name: coverage-report, path: coverage/, retention-days: 7 }
```
- [ ] **Verify** YAML parses.
- [ ] **Commit:** `ci(coverage): merge job — union coverage gated by a line floor`

### Task 3: Point the dashboard at the merged report

**Files:** `.github/workflows/ci.yml` (`deploy-report` job, ~213-233)

- [ ] Add `coverage` to `deploy-report.needs` (it now produces `coverage-report`): `needs: [changes, gate, e2e, coverage]`. The existing "Download coverage artifact" (name `coverage-report`) now pulls the merged report; no other change.
- [ ] **Verify** YAML parses.
- [ ] **Commit:** `ci(coverage): publish the merged coverage to the dashboard`

### Task 4: Local end-to-end verify + docs + PR

- [ ] **Local merge re-run** (Docker): produce both blobs; confirm the merge prints ~60.76% and that `--coverage.thresholds.lines=99` exits non-zero (floor bites), then 60 passes:
```bash
rm -rf .vitest-reports coverage
npx vitest run --coverage --reporter=blob --outputFile=.vitest-reports/blob-unit.json
bash e2e/fixtures/test-db.sh up
RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db --coverage --reporter=blob --outputFile=.vitest-reports/blob-db.json
bash e2e/fixtures/test-db.sh down
npx vitest --merge-reports --coverage --coverage.reporter=text-summary --coverage.thresholds.lines=99   # exits 1
npx vitest --merge-reports --coverage --coverage.reporter=text-summary --coverage.thresholds.lines=60   # passes
```
- [ ] **Docs:** add a `docs/ARCHITECTURE.md` decision entry — coverage is the vitest-4 native union of the `gate` + `db-tests` tiers, floor 60 in the `coverage` job, ratcheted per phase; v1's "54%" is superseded (v4 re-baseline).
- [ ] **Commit + push + PR;** confirm on CI that the `coverage` job consumes both blobs, reports the merged total, and the floor gates. Merge when green.

## Verification
- Local: the Task 4 commands (the `=99` run must fail, `=60` pass).
- CI: the `coverage` job merges both tier blobs and enforces the floor; `deploy-report` publishes the merged number.
</content>
