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
  - `purses-w7ss.1` PR 1 — **merged #369** (tokens, card, item panel, item schema, items list, redirects, e2e map check)
  - `purses-w7ss.2` PR 2 — sort screen, ranking + lazy draft + pins, atomic save, unique index, sort redirects, onboarding rewrite
  - `purses-w7ss.3` PR 3 — collections grid, home-as-grid, phone bottom bar
- Related open: `purses-1hj6` (test-file type errors; tests excluded from build tsconfig)

## Status log (newest first)

- 2026-10-02 (PR 2): **CI green on #370, mergeable; merge left to the owner** because it auto-deploys migration 0003 with the duplicate-draft data step (owner-veto item). After merge: `/close-out` purses-w7ss.2 (beads + lessons already harvested; delete `.git/sdd/feat-ux-redesign-pr2` scratch and `.superpowers/sdd/2026-10-01-ux-redesign-pr2-sort/`), then PR 3.
- 2026-10-02 (PR 2, session 3, end): all 14 tasks complete and reviewed; whole-branch adversarial review (7 personas) → one fix wave (5 commits) → scoped re-review clean; full gate green; **PR #370 open and ready** with light/dark tablet+phone screenshots. Next: CI → squash-merge → `/close-out` purses-w7ss.2 → PR 3 (purses-w7ss.3). Follow-up beads filed in the epic: purses-w7ss.5 (P2), .6, .7, .8, .9, .10, .11 (residual minors); purses-mimb closed. Rulings for the owner are listed in PR #370's body.
- 2026-10-02 (PR 2, session 3): Tasks 7–12 complete and reviewed (T7 c18d95a92; T8 eb742fcd6; T9 48f9225b6; T10 d38aa7928; T11 b10d929b3; T12 16a8bfaa6). Task 13 (sort-journey e2e, deletes 14 specs, CI map) implementing; then T14 (docs, full gates, screenshots), final whole-branch review, PR. Follow-up beads filed: purses-w7ss.5 (revision drops open-draft pins), purses-w7ss.6 (items/[rid] DELETE unlocked/TOCTOU). Incident + rule: two overlapped implementers shared the index and one commit swept the other's deletions (re-partitioned to b793ebc99/41dd4985d); never overlap implementers. Ledger: `.superpowers/sdd/2026-10-01-ux-redesign-pr2-sort/progress.md`.
- 2026-10-02 (PR 2, session ended on usage limit): Tasks 1–5 complete; Task 6 fixed (0b2e14901) with its scoped re-review in flight; Task 7 landed (f07148a6a) with a minor fix round still to dispatch; Task 8 (Sort screen) implementer was running and will commit on its own. Full state + resume steps at the END of `.superpowers/sdd/2026-10-01-ux-redesign-pr2-sort/progress.md`. Beads: purses-w7ss.2.6/.2.7/.2.8 claimed; purses-mimb filed (shared-draft delete).
- 2026-10-02 (PR 2): Tasks 1–5 complete and reviewed (…, migration 0003 b9a23ed3c: save_key + two partial unique indexes + data step deleting older duplicate open drafts and their shares; deploy-window note ruled for the PR body). Task 6 landed (e419b0c76, save-and-share) → in review; Task 7 (Keep sorting / Pause) implementing. Then T8 Sort screen (the big one) … T14.
- 2026-10-02 (PR 2): Tasks 1–3 complete and reviewed (bc35356f8, 7970c5791, d8756b813). Task 4 landed (5492211fb, pins API + locked draft writes) → in review; Task 5 (migration 0003, deletes older duplicate open drafts, partial unique indexes, hash pin) implementing. Then T6 save-and-share … T14.
- 2026-10-02 (PR 2): pre-flight done (rulings in ledger: migration 0003 deletes older duplicate open drafts — no superseded status exists; manualRank stays 0-based; draft results/[n] redirects). Task 1 landed (bc35356f8, comparable set = Love+Like, tier-first ranking) → in review; Task 2 (sort-phase chooser) implementing. Remaining T3–T14.
- 2026-10-02 (PR 2): plan committed (63ef52777, 14 tasks), task beads purses-w7ss.2.1–.14, SDD workspace `.superpowers/sdd/2026-10-01-ux-redesign-pr2-sort/` (ledger with pre-flight rulings: migration 0003 self-heals duplicate open drafts instead of an owner-run query). Pre-flight conflict scan running, then Task 1.
- 2026-10-02: **PR 1 merged** (#369 → c67cc4fc8), purses-w7ss.1 closed, scratch deleted, lessons in `bd memories ux-redesign-pr1-lessons`. Branch `feat/ux-redesign-pr2` cut from main; PR 2 plan being written to `docs/superpowers/plans/2026-10-01-ux-redesign-pr2-sort.md` (then pre-flight + SDD). Open follow-ups in the epic: purses-w7ss.4 (inline tints), purses-pxp1 (owner call: photo Move to…), purses-x7rs (items.status column), purses-zs88 (per-item usage read), purses-g478 (broad photo stub).
- 2026-10-01 (PR 1): visual polish landed (f74d531bf). Final whole-branch review → CONCERNS: photo Move UI dropped with /photos (ruled: delete dead PhotoGallery/PhotoMoveBar, keep reassign route, bead purses-pxp1 for the owner), plus cheap minors (zoom on tap, viewer arrow keys, chip 409 refresh, Archive respects leave guard, DESIGN.md card/glass line, dead ItemForm edit mode). Fix wave running → scoped re-review → push (subagent) → PR → CI → merge → close-out. Beads: purses-x7rs (status column), purses-zs88 (per-item usage read), purses-g478.
- 2026-10-01 (PR 1): Tasks 1–10 complete; all gates green at af86fbef5 (lint, test:ci 1577, build, auth:verify, test:db 639, e2e 67/67, axe 0). Screenshots exposed 8 visual defects (··· over cover thumb, story textarea clips, Size reads as input, faint Add-photos rim, dark Onward chip, hero/strip alignment, phone name truncation, phone confirm overlap) → visual-polish round running. Then final whole-branch review (Opus), PR, CI, merge, close-out purses-w7ss.1. Follow-up beads: purses-g478 (broad photo stub), items.status column (see bd).
- 2026-10-01 (PR 1): Tasks 1–8 complete and reviewed; Task 9 fix round 1 landed (3ce2d6cc1, rotate/save response waits + empty-photos unit test), scoped re-review running. Next: T10 (API.md, decision 41, full gates, screenshots, spelling sweep, T7 minors), final whole-branch review, PR, merge, close-out purses-w7ss.1.
- 2026-10-01 (PR 1): Tasks 1–8 complete and reviewed. HEAD e49249d9f. Task 9 (panel e2e journey, a11y screens, CI e2e map + check) dispatched. Then T10 (docs sync, gates, screenshots), final whole-branch review, PR, merge, close-out purses-w7ss.1.
- 2026-10-01 (PR 1): Tasks 1–6 complete and reviewed (T6 took two fix rounds: status line in flow). HEAD 1798b1d0e. Task 7 (items list grid) dispatched. Remaining: T7–T10, final review, PR.
- 2026-10-01 (PR 1): Tasks 1–5 complete, each reviewed (T4 and T5 needed one fix round). HEAD 9c4db205a. Task 6 (overflow Archive/Delete) dispatched. Remaining: T6–T10 (list grid, redirects, e2e + CI map, docs/screenshots), then final whole-branch review, PR, merge, close-out.
- 2026-10-01 (PR 1 in progress on `feat/ux-redesign-pr1`): Tasks 1–3 complete and reviewed clean (b5ba3e296 tokens, 0dbe41315/d64db8e53 card+pills+blur migration, 44693a223/d71229913 strict item schema). Task 4 (panel form, 91a97dc98) in review. Follow-up bead purses-w7ss.4 (inline tints). Ledger: `.superpowers/sdd/2026-10-01-ux-redesign-pr1-item-panel/progress.md`.
- 2026-10-01: spec PR #368 merged (866b11920). PR 1 plan committed (e0f26656a) on `feat/ux-redesign-pr1`. SDD ledger: `.superpowers/sdd/2026-10-01-ux-redesign-pr1-item-panel/progress.md` (pre-flight rulings recorded). Task 1 (glass tokens) dispatched.
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
