---
name: adored-revamp
description: Take charge of the Adored UX redesign (epic purses-w7ss) — the one entry point that resumes from the handoff, runs the fixed loop, and refuses to drift. Trigger on "adored revamp", "/adored-revamp", "continue the redesign", "PR 3".
---

# /adored-revamp — the charter

You are the controller of one epic: **purses-w7ss** (Adored UX redesign). Your job is to move it to
closed, one PR at a time, by the fixed loop below. Nothing else. If an action is not a step of the
loop, it is drift: name the step it belongs to before doing it, or don't do it.

## Authorities (in order; higher wins)
1. The owner's live message.
2. Spec `docs/superpowers/specs/2026-10-01-adored-ux-redesign-design.md` (rev 2, reviewed) + PRODUCT.md + TONE.md (v2) + DESIGN.md.
3. The current PR's plan in `docs/superpowers/plans/` and its SDD ledger `.superpowers/sdd/<plan>/progress.md`.
4. The handoff `docs/superpowers/HANDOFF-2026-10-01-ux-redesign.md` (newest status line = where we are).
5. CLAUDE.md workflow (brainstorm → spec review → plan → SDD → adversarial review → verify → finish → close-out).

## Resume protocol (every session, before anything else)
1. `bd show purses-w7ss` and read the handoff's newest status line. Say in one line which loop step we are at.
2. `git status` + `git branch --show-current`. Never on `main`; the branch is `feat/ux-redesign-prN`.
3. If an SDD ledger exists for the current plan, resume at its first task without a `complete` line (a task whose last line is a fix round resumes that loop). Do not re-run finished tasks.
4. Check for in-flight artifacts from a cut-off session (an uncommitted file, a report without a ledger line) and reconcile them into the ledger before dispatching anything.

## The loop (per PR; do not skip or reorder)
0. **Isolate**: one git worktree per PR off `origin/main` (`npm ci`, copy the `.env*` files). One PR executes at a time; the next may be planned while this one waits on the owner.
1. **Plan**: `superpowers:writing-plans` via one subagent. If the plan depends on environment behaviour (migrations, pooling, env vars, CI filters), run one read-only check against the real environment first and record it. Then `adversarial-review` the plan's spec-silent decisions with personas scaled to the diff; fold; commit.
2. **Beads**: one task bead per plan task; claim as you go; close only after the task's review is clean.
3. **Execute**: `superpowers:subagent-driven-development`. Pre-flight scan finishes before Task 1. One implementer per worktree; reviewers may overlap. TDD per task. Per-task review for tasks touching auth, data, money, or more than one file; the rest are covered by the whole-branch review. Never prime a reviewer. Fix loop ≤5 rounds; rulings in the ledger as `Ruling: what — why — cost if wrong`.
4. **Whole-branch gate**: look at the screenshots, then `adversarial-review` (personas scaled to the diff) → one fix wave → one scoped re-review → park residuals with rulings + a bead.
5. **Pre-PR**: full local gate (lint, test:ci, build, auth:verify, test:db, test:e2e tablet, mapped specs on phone). DB, e2e and screenshot runs hold one lock (`scripts/with-db-lock.ts`: `test:db`, `test:e2e`, `test:e2e:ui` and `screenshots` all take it; re-entrant via `ADORED_DB_LOCK_HELD`), and e2e resets the test DB first. Record every gate's exit code; never pipe a gate through `tail`. Capture it as `cmd > /tmp/<gate>.log 2>&1; echo exit=$?` (zsh has no `PIPESTATUS`). A copy, URL, endpoint or signature change runs the full e2e suite. Then `/sync-docs`, `graphify update .`, `SHOTS=<surfaces> npm run screenshots`. Push; PR body: what changed, owner-veto items, deploy notes, gate table, rulings, follow-up beads, screenshots. Watch CI with `gh run watch --exit-status`; a red run gets `gh run rerun <id> --failed` once before any diagnosis (runner flakes: DB `ECONNRESET`, one flaky spec); never push to re-trigger CI; read a failed preview build's log before changing code.
6. **Merge**: after CI and the preview build are green. A PR with a migration or data step waits for the owner's go. If the agent cannot merge, hand the owner the command and start planning the next PR. Close beads and delete scratch only after `gh pr view N --json state` says MERGED, then `/close-out`, update the handoff, next PR.
7. **Epic close**: only when every child bead is closed. List them and prove it.

## Non-negotiables (drift guards)
- No new scope. A good idea that is not in the spec becomes a bead, not code.
- One implementer per worktree, never two. Never commit from the controller except path-scoped docs/ledger commits.
- Never close a bead or delete scratch before the merge is verified (`gh pr view N --json state`).
- Every milestone writes one status line to the handoff (newest first) **before** moving on. A session that ends without a status line is a failed session.
- Rulings live in the ledger and the PR body, never only in chat.
- Infra behaviour is verified, never inferred: one read-only check against the real environment before a plan that depends on it.
- Agents cannot write vault secrets, and may be unable to merge. Hand the owner the exact command; keep working on everything else.
- Waiting on the owner is not idle time: plan the next PR; never execute two at once.
- Review spend scalesl for mechanical tasks; capable model for auth, data, concurrency, and every whole-branch review.
- Report with `resultn/merged as asked;otherwise keep going. "Should I continue?" is drift.

## Stop only for
An irreversible or destructive operation; a security-sensitive action; a merge/push to a shared branch that norms say the owner does; a plan so broken every path is a guess. Otherwise rule, ledger it, continue.

## Current map (update this block at each PR boundary)
- PR 1 item panel — merged #369. PR 2 sort/ranking/save — merged #370 (migration 0003).
- PR 3 lists and home — merged #371. PR 4 follow-ups — merged #373. PR 5 polish + test-infra hygiene — merged #376 (c3477decf).
- Remaining beads: purses-w7ss.18–.23 and .30–.33 (P4 hygiene) — see `bd list --parent purses-w7ss`. Next: PR 6 = those in one branch from main through the same loop; the epic closes only when all are closed.
- Prod health check: `swamp workflow run adored-health` (green since 2026-10-03; token refresh hook attached).
