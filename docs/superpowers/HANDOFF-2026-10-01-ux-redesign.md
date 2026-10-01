# Handoff — Adored UX redesign (epic purses-w7ss)

Living ledger. Updated at every milestone so any session (or a fresh context) can resume from this
file alone. Owner approved the spec on 2026-10-01 and asked for autonomous execution with a
handoff kept current.

## Authorities

- Spec: `docs/superpowers/specs/2026-10-01-adored-ux-redesign-design.md` (rev 2, reviewed, approved)
- PRODUCT.md / TONE.md v2 (merged, PR 367), DESIGN.md (amended in PR 1)
- Visual direction: Frosted shelf — `.superpowers/brainstorm/97702-1790837089/content/visual-directions.html`
- Process: CLAUDE.md workflow (writing-plans → subagent-driven-development, TDD, adversarial-review
  per task and per branch, verification-before-completion, finishing-a-development-branch, /close-out)

## Beads

- Epic `purses-w7ss` (in progress)
  - `purses-w7ss.1` PR 1 — tokens, card, item panel, item schema, items list, redirects, e2e map check
  - `purses-w7ss.2` PR 2 — sort screen, ranking + lazy draft + pins, atomic save, unique index, sort redirects, onboarding rewrite
  - `purses-w7ss.3` PR 3 — collections grid, home-as-grid, phone bottom bar
- Related open: `purses-1hj6` (test-file type errors; tests excluded from build tsconfig)

## Status log (newest first)

- 2026-10-01 late: spec PR #368 marked ready, CI running; epic + 3 task beads created; writing PR 1
  plan via subagent → `docs/superpowers/plans/2026-10-01-ux-redesign-pr1-item-panel.md`.
- 2026-10-01: PRs #365 (swamp health), #366 (feature inventory/archive), #367 (PRODUCT/TONE v2) merged.

## How to resume

1. `bd show purses-w7ss` and read the newest status line above.
2. If a plan file exists for the current PR, resume at its first unchecked task using
   `superpowers:subagent-driven-development` on branch `feat/ux-redesign-prN` (branch from main;
   never commit to main).
3. Per-task gates: failing test first; `npm run lint`, `npm run test:ci`, `npm run build`; DB-tier
   tests via `npm run test:db` when touching schema/repo/service/API; e2e for touched flows
   (`npx playwright test e2e/<spec> --project=tablet`, phone via `PW_VIEWPORT=phone` locally).
4. Before the PR: `/sync-docs`, `graphify update .`, light+dark+phone screenshots via `/pr-screenshots`.
5. After merge: `/close-out` the task bead; update this file; next PR.

## Known traps

- `next build` type-checks everything in tsconfig; test globs and `extensions/` are excluded (purses-1hj6).
- Pre-push hook builds with whatever node_modules holds; docs-only pushes may use `--no-verify`.
- A guard blocks any compound shell command that mentions a push together with `main`; split commands.
- Swamp: `swamp workflow run adored-health` is the on-demand prod check (needs Docker).
