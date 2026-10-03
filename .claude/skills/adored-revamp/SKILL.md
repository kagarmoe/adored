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
1. **Plan exists?** No → `superpowers:writing-plans` via one subagent from the spec section for this PR; then `adversarial-review` the plan's "spec-silent decisions" (scale personas to the diff), fold findings in, commit the plan.
2. **Beads**: one task bead per plan task under `purses-w7ss.N`; claim as you go; close only after the task's review is clean.
3. **Execute**: `superpowers:subagent-driven-development`. One implementer at a time (shared git index — see `bd memories sdd-never-overlap-implementers`). A reviewer may overlap an implementer. TDD inside every task. Fix loop ≤5 rounds, scoped re-reviews, rulings written to the ledger as `Ruling: what — why — cost if wrong`.
4. **Whole-branch gate**: `adversarial-review` with all personas that have something to bite on → ONE fix wave → ONE scoped re-review → park residuals with rulings + a bead.
5. **Pre-PR**: full local gate (lint, test:ci, build, auth:verify, test:db, test:e2e tablet, phone journeys), `/sync-docs`, `graphify update .`, `/pr-screenshots` (light + dark, tablet + phone). Push, PR with: what changed, owner-veto items, deploy notes, gate table, rulings list, follow-up beads, screenshots.
6. **Merge**: the OWNER merges when the PR deploys a migration or a data change; otherwise merge after CI is green. Then `/close-out` (bead, lessons → `bd remember`, scratch). Update the handoff. Next PR.
7. **Epic close**: only when every child bead (plan, tasks, follow-ups) is closed. List them and prove it.

## Non-negotiables (drift guards)
- No new scope. A good idea that is not in the spec becomes a bead, not code.
- Never two implementers at once. Never commit from the controller except path-scoped docs/ledger commits.
- Never close a bead or delete scratch before the merge is verified (`gh pr view N --json state`).
- Every milestone writes one status line to the handoff (newest first) **before** moving on. A session that ends without a status line is a failed session.
- Rulings live in the ledger and the PR body, never only in chat.
- Agents cannot write vault secrets or merge production deploys (classifier). Hand those to the owner with the exact command; keep working on everything else.
- Report with `result:` only when the PR is open/merged as asked; otherwise keep going. "Should I continue?" is drift.

## Stop only for
An irreversible or destructive operation; a security-sensitive action; a merge/push to a shared branch that norms say the owner does; a plan so broken every path is a guess. Otherwise rule, ledger it, continue.

## Current map (update this block at each PR boundary)
- PR 1 item panel — merged #369. PR 2 sort/ranking/save — merged #370 (migration 0003).
- PR 3 lists and home — merged #371 (6d7eeb1f7). All three spec PRs are shipped.
- Follow-up beads: purses-w7ss.4–.17 (see `bd list --parent purses-w7ss`); owner decisions .10 and .14. The epic closes only when all are closed — next sessions work the follow-ups as small PRs through the same loop.
- Prod health check (`swamp workflow run adored-health`) is red until the owner re-stores VERCEL_TOKEN — command in the handoff.
