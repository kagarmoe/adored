# Visual regression & automated UI screenshots — exploration

**Status:** Exploration / starting point (not a committed plan)
**Bead:** `purses-04q`
**Date:** 2026-06-09

## Why this exists

Several UI PRs (#108, #111, #117) shipped with an unchecked "visual check" box — the
surfaces are auth-gated, so reviewers couldn't see the result without standing up the app.
We now capture screenshots manually during verification and link them from a dedicated
`assets` branch (see the `ui-prs-include-screenshots` practice). That works but is manual.

The idea on the table: **make screenshot capture part of e2e, store them on a long-lived
`assets` branch, and only add screenshots that differ from what's already there.**

This doc records the analysis so we don't re-derive it, and names the decision to make.

## The goal (what "good" looks like)

1. Every UI PR carries up-to-date screenshots of the affected surfaces, with ~zero manual effort.
2. Visual *changes* are surfaced for review; unchanged surfaces are silent.
3. Binaries stay out of `main` history.
4. Works on a **private** repo (raw-URL inline embeds 404 — see #117).

## The honest critique of "diff screenshots against the branch"

The capture-in-e2e part is sound (the Playwright + `auth.setup` + seed-fixtures machinery
already exists). The **"only add what differs"** part is the trap: that is **visual
regression testing (VRT)**, a well-trodden domain with sharp edges that a hand-rolled
branch-diff inherits without the tooling that tames them.

### Sharp edge 1 — cross-environment rendering
Screenshots differ for reasons unrelated to the change: font hinting/antialiasing
(macOS vs Linux/CI), Chromium version bumps, sub-pixel layout, scrollbars, caret blink.
A shot captured locally on macOS will *always* differ from one captured in CI. Naive
comparison ⇒ constant false positives. This is the #1 reason homegrown VRT gets ripped out.
→ Capture in **one fixed environment only** (a pinned Docker image, same in CI and locally),
with an antialiasing-aware tolerance threshold and masked dynamic regions.

### Sharp edge 2 — determinism (blocking prerequisite)
Our seed is non-deterministic and the UI renders live values:
- `generateId` → random ULID (every entity id changes per run).
- `SessionAnalytics` renders `{timeSpent}m` from `new Date()` — changes every run.
- Cards render `updatedAt.toLocaleDateString()` and other time-derived strings.

Any diffing approach is dead on arrival until the seed **pins IDs and freezes the clock**
and time-based UI is masked. *Nothing visual works without this.* This is the first piece
of work regardless of which path we choose.

### Sharp edge 3 — we'd be rebuilding `toHaveScreenshot()`, worse
Playwright already ships visual comparison: baseline storage, per-platform baselines,
threshold config, and an `--update-snapshots` accept-flow. "Diff against the assets branch"
is that, hand-coded, minus the threshold logic that keeps it from being flaky.

### Sharp edge 4 — baselines vs review artifacts are two jobs
- A **baseline** is "the accepted look" — updates deliberately (on merge to main), with a
  human saying *yes, this is the new correct*.
- A **per-PR shot** is an ephemeral review aid.

Sharing one `assets` branch for both conflates them: every *intentional* UI change reads as
a "failure" until someone re-baselines, and that accept step must be explicit or the gate is noise.

## Options

### A. Hosted VRT (Argos / Chromatic / Percy) — recommended if a service is acceptable
- Normalizes cross-env rendering; stores baselines off-repo (no `main` bloat — satisfies the
  original instinct *better* than a branch).
- Human approve-new-baseline flow built in.
- **Posts inline visual diffs as a PR check** — which also solves the private-repo
  inline-rendering problem we hit in #117.
- **Tradeoffs:** third-party dependency; free-tier/cost question; screenshots leave our infra
  (a privacy call for a personal-belongings app — worth weighing given the product's register).
- Argos has a free tier and is partly self-hostable; Chromatic is the Storybook-native option.

### B. Playwright-native `toHaveScreenshot()` — recommended if staying in-house
- No third party. Use (a) deterministic seed + frozen clock, (b) capture only in a pinned
  container, (c) `animations: 'disabled'` and masked dynamic regions.
- **Cost:** baselines live in the repo working tree (Playwright requires them at test time),
  i.e. **binaries in `main`** — the exact thing the assets-branch idea wanted to avoid.
  Manageable (many projects commit `__screenshots__/`), but it's an honest tradeoff.

### C. Hand-rolled branch-diff (the original idea) — not recommended
- You inherit all of A/B's flakiness with none of the tooling. Most maintenance burden.
- Keep the `assets` branch for **PR review artifacts** (its current, good use) — but don't make
  it the regression-detection mechanism.

## Recommendation

1. **Do the prerequisite first, independent of the path:** a deterministic e2e seed
   (pinned ULIDs, frozen clock via a fixed `Date`/injected clock) and a convention for masking
   time-based UI. File/route this as its own unit of work — it also makes the existing e2e
   specs more robust.
2. **Then pick A vs B** on the privacy/cost axis:
   - Willing to use a service → **A (hosted VRT)**; it also fixes private-repo inline diffs.
   - Must stay in-house → **B (Playwright-native)**; accept baselines-in-repo.
3. **Keep the `assets` branch** as the human-facing PR screenshot store regardless (it's
   orthogonal to regression detection and already working).

## Open decisions (for the bead)
- [ ] Service vs in-house (privacy/cost vs binary-in-repo).
- [ ] Which surfaces are "key" enough to baseline? (results, compare, triage, collections home,
      empty states — start small.)
- [ ] Does the visual check **gate** merges, or run advisory? (Flaky gates block dev; start advisory.)
- [ ] Capture environment: pin a Docker image for both CI and local capture.

## Prior art in this repo
- `e2e/` (Playwright), `e2e/auth.setup.ts`, `e2e/fixtures/{seed,db}.ts`, `e2e/fixtures/test-db.sh`.
- `docs/plans/2026-05-30-e2e-ui-testing.md` (existing e2e plan).
- `assets` branch (current PR-screenshot store).
