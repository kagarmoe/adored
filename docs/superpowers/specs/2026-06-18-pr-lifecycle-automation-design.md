# PR-lifecycle automation — design

**Date:** 2026-06-18
**Type:** Developer-workflow automation (agent skills + CLAUDE.md protocol + one git hook). No product-code changes.

## Problem

Several keep-current chores are done by hand at the end of a feature and are easy to skip: updating the governance docs, refreshing the knowledge graph, harvesting lessons into `bd remember`, closing the bead, and cleaning the `.git/sdd` scratch. This session did all of them manually three times (the security cluster, jz4, the docs cleanup). The goal is to codify that rhythm so it happens reliably at the two moments that matter, without losing anything before a merge.

## Settled design (with the user)

Everything keys to the **feature-branch lifecycle the agent drives** — not to "session end" (rejected) and not to GitHub Actions (can't see the chat).

**On push (before merge) — lands in the reviewed PR diff:**
1. **`/sync-docs`** — update the affected governance docs (ARCHITECTURE, DEPLOYMENT, DESIGN, PRODUCT, README, TONE) from the session: spec + implementation + the branch diff. Targeted touches via a code-area→doc map, not a full rewrite.
2. **`/graphify --update`** — refresh the committed graph (`graph.json` + `GRAPH_REPORT.md`). Not reviewed (reviewers ignore the generated churn).

**Cleanup (immediately after the agent merges the PR) — `/close-out`, any reasonable order:**
1. Close the bead(s) for the merged work.
2. Harvest lessons + recurring problems from the **chat and the ledger** → `bd remember`.
3. Delete this problem's `.git/sdd` scratch.

**Hard rule:** nothing destructive (bead close, sdd delete) happens before the merge is confirmed. The bead is the "is it done?" truth; the sdd files are the review-loop's working context — both must live until merge.

## Mechanism (decided)

A detached git hook can't read the Claude conversation, so the session-aware steps are **agent-run skills** fired by a CLAUDE.md protocol, with a git **pre-push hook as a deterministic backstop**. The merging agent runs `/close-out` itself right after `gh pr merge`.

| Item | Artifact | Mechanism |
|---|---|---|
| Doc sync | `.claude/skills/sync-docs/SKILL.md` | agent skill; pre-push hook backstops it |
| Graph update | existing `/graphify --update` | agent runs pre-push; CLAUDE.md line |
| Close-out | `.claude/skills/close-out/SKILL.md` | agent skill, post-merge |
| Backstop | `scripts/hooks/pre-push` + installer | deterministic git hook |
| Spine | `CLAUDE.md` "PR lifecycle" section | protocol the agent follows |
| Precision | `docs/doc-ownership.md` (the code-area→doc map) | read by both `/sync-docs` and the hook |

## Components

### 1. `docs/doc-ownership.md` — the code-area → doc map

A small committed table mapping source globs to the doc (and section) they assert facts about, so doc-sync is surgical and the pre-push backstop is precise. Seed entries (verified this session):
- `src/lib/env.ts` → README (env vars) · ARCHITECTURE (decision: AUTH_*/VERCEL cookie)
- `src/lib/auth.ts`, `src/middleware.ts` → README (auth) · ARCHITECTURE (decision: auth/JWT)
- `src/lib/db/schema.ts`, `drizzle/**` → README (tables) · ARCHITECTURE (where-we-are) · the two legacy specs
- `src/server/dal/**`, `src/server/repositories/**` → ARCHITECTURE (authz/data decisions)
- `src/lib/design/**`, `tailwind*`, `**/*.css` → DESIGN
- `src/app/**` view/page components → (no auto-doc; DESIGN/PRODUCT only on deliberate change)
- deploy/env/CI config → DEPLOYMENT
- PRODUCT.md, TONE.md → **never auto-synced** (deliberate edits only)

The map is the real maintained artifact; skills + hook are thin over it.

### 2. `/sync-docs` skill (agent, pre-push)

Reads the branch diff (`git diff main...HEAD`) + the session's decisions, consults `doc-ownership.md`, and makes **targeted** edits to only the docs whose asserted facts moved. Verifies each claim against live code before writing (the lesson from the ARCHITECTURE.md authoring). Two scopes: **incremental** (default, per-PR, surgical) vs **full resync** (the rare catch-up sweep, its own PR — what #202 was). Output is committed on the feature branch so it's in the PR diff and co-reviewed.

### 3. `/close-out` skill (agent, post-merge)

Run immediately after the merging agent confirms `gh pr merge`. Steps (idempotent, any order):
- **Bead:** `bd close <id> --reason "merged in <PR>"` for the problem's bead(s).
- **Lessons:** scan the conversation + the ledger for durable lessons / recurring problems; for each, `bd remember --key <slug>` (dedupe against existing memories; update in place if present). Source priority: **chat first** (never clobbered), ledger second.
- **Scratch:** delete this problem's `.git/sdd` scope (see namespacing below).

### 4. `scripts/hooks/pre-push` + installer (deterministic backstop)

On push, compute the pushed range's diff. If it touches a source glob in `doc-ownership.md` but the push touches **none** of that glob's mapped docs, **soft-block** with an overridable message: `"<file> changed but its docs (<docs>) weren't — run /sync-docs, or 'git push --no-verify' to override."` Warn-only for the graph (don't block on a stale graph). No husky exists today, so install via a committed `scripts/install-hooks.sh` wired to `package.json` `"prepare"` (runs on `npm install`); the script appends to any existing pre-push hook rather than clobbering. (Note: the gate pre-push the CLAUDE.md references doesn't actually exist as a committed hook — the gates run in CI; this spec adds the *doc backstop* pre-push, and optionally folds the gates in as a follow-up.)

### 5. CLAUDE.md "PR lifecycle" section

The spine, ~8 lines:
- Before opening/updating a PR: run `/sync-docs` + `/graphify --update`; the pre-push hook backstops doc-sync.
- Immediately after merging: run `/close-out` (bead close + lessons→memory + sdd delete). **Never before merge.**
- Multiple problems per session: each problem's `.git/sdd` scratch is namespaced by branch; never clobber an in-flight problem's scratch.

## `.git/sdd` namespacing (fixes the clobber the user flagged)

Because `.git/sdd/` is one shared dir, starting problem B while A's PR is in review **overwrites A's ledger/briefs** before A merges. Fix: namespace scratch per branch — `.git/sdd/<sanitized-branch>/...` — so concurrent problems don't collide, and `/close-out` deletes only its own branch's scope. This is a change to how the agent uses the SDD scratch (codified in CLAUDE.md), since the superpowers SDD scripts write flat paths by default. Lessons still harvest from the chat first, so a missed namespace never loses lessons — only review-loop convenience.

## Open decisions for review

1. **Hook install:** committed `scripts/install-hooks.sh` + `package.json` `"prepare"` (auto on `npm install`) — recommended — vs manual install documented in README.
2. **pre-push severity:** soft-block-with-`--no-verify` (recommended; a real backstop) vs warn-only (lower friction, easily ignored).
3. **sdd namespacing:** include now (recommended; it's the clobber fix) vs defer until overlapping-problems actually bite.

## Verification

- `/sync-docs` on a branch that changed `src/lib/env.ts` updates README's env section and nothing else; leaves PRODUCT/TONE untouched.
- pre-push hook soft-blocks a push that changes `src/lib/db/schema.ts` with no README/ARCHITECTURE touch; passes once the doc is touched or `--no-verify` is given.
- `/close-out` on a merged PR closes the bead, writes ≥1 `bd remember`, and removes only that branch's `.git/sdd` scope; a second problem's scratch is untouched.
- CLAUDE.md protocol is unambiguous about the never-before-merge rule.
- `npm run build` + `lint` unaffected (no product code touched).

## Out of scope

- Migrating the CI gates into the pre-push hook (separate concern; gates stay in CI).
- A GitHub Action for any of this (can't access the chat; rejected).
- Changing the superpowers SDD plugin itself (we namespace our *usage*, not the plugin).
- Auto-syncing PRODUCT.md / TONE.md (deliberate edits only — they're first-order contracts).
