# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Modes

Agents and subagents MUST use one of these models:

Anthropic/Claude:
  model: Opus 4.8
  effort: ultracode

OpenAI/Codex:
  model: gpt-5.5
  effort: "xhigh"

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->


## Build & Test

Gates (the pre-push hook mirrors these):

```bash
npm run build         # next build
npm run test:ci       # unit tests
npm run lint          # eslint
npm run auth:verify   # auth wiring check
npm run test:db       # DB-backed tests (Docker; RUN_DB_TESTS=1)
```

## Align with Next.js Opinions (REQUIRED)

Next.js is opinionated. Follow its conventions, not workarounds:

1. **App Router** — Use `src/app/` with file-based routing. Never Pages Router.
2. **Server Components by default** — Mark interactive UI `"use client"` only when needed (forms, hooks like `useState`)
3. **Data fetching in Server Components** — Async functions in Server Components, never in Client Components
4. **API Routes for mutations** — All POST/PATCH/DELETE via `src/app/api/` routes, no direct DB calls from client
5. **Native fetch()** — No SWR/React Query; use `fetch()` with error handling
6. **NextAuth v4 integration** — Follow canonical patterns: DrizzleAdapter, JWT strategy, session callbacks
7. **Middleware for route protection** — Guard routes in `src/middleware.ts`, not API guards
8. **Suspense for async UI** — Stream loading states with React Suspense
9. **No hardcoded secrets** — All config via `process.env.*` with validation at module load
10. **TypeScript strict mode** — All inference errors resolved, no `any`

## Code Quality

- **Comments on WHY only** — Code is self-documenting via naming
- **No premature abstraction** — Three lines before helper; DRY within reason
- **Validate at boundaries** — *input validation*, not test scope: re-check untrusted data (user input, external APIs) at the edge; don't re-validate trusted internal call results. Testing is separate and broad — see Workflow gates.
- **Follow auth patterns** — API routes, error responses, validation precedent already set

## Workflow

Use the **superpowers** skills for all substantive work, in this order — each arrow is a gate, don't
skip ahead. Track work in **beads** (`bd`), never TodoWrite.

1. **`brainstorming`** → design spec to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
2. **Review the spec FIRST.** Before any plan or code, run `adversarial-review` on the spec (personas
   scaled via the lens→engine table below), then `superpowers:receiving-code-review` to fold the
   findings back in. A spec that hasn't been adversarially reviewed does not proceed to planning.
3. **`writing-plans`** → task-by-task plan to `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`.
4. **Execute** with `superpowers:subagent-driven-development` (same session) or `executing-plans`
   (parallel session): fresh subagent per task, `test-driven-development` within each task (failing
   test first), `systematic-debugging` for any bug *before* proposing a fix, plus the per-task
   spec+quality review.
5. **Review every change with the personas.** Each review — per-task and the final whole-branch one —
   runs `adversarial-review` (guilty-until-proven; scale the persona set to the diff via the lens→engine
   table below) wrapped in the `superpowers:requesting-code-review` → `receiving-code-review` cycle.
   Review is a GATE before merge; no substantial change merges without it.
6. **`superpowers:verification-before-completion`** before claiming anything done/passing/fixed —
   evidence (the command + its output), never assertion.
7. **`superpowers:finishing-a-development-branch`** to merge/PR/clean up — don't hand-roll it.

**Reviews always call the adversarial-review personas** — spec (step 2), per-task, and whole-branch.
Generic review rubber-stamps; scale the persona set to what changed (lens→engine table under
*Conventions & Patterns*). The spec review is the first review of every effort.

**Git discipline:**
- **Branch:** feature branch off `main` → PR → squash-merge → Vercel auto-deploys prod. Never commit
  directly to `main`.
- **Isolate concurrent work:** a branch switch in a *shared* working tree silently discards another
  agent's uncommitted changes. For substantial/parallel work, branch into your own git worktree (or
  `EnterWorktree`); never switch branches with uncommitted changes (commit or stash first).
- **Commit:** frequent, one logical change per commit; don't park work only in the working tree.

## PR lifecycle automation

- **Before pushing / opening a PR:** run `/sync-docs` (update the governance docs this branch's
  changes affect, per `docs/doc-ownership.md`; never PRODUCT/TONE) and `/graphify --update` (refresh
  the committed graph). The `.githooks/pre-push` doc-sync step soft-blocks a code push whose mapped
  docs weren't touched — run `/sync-docs`, or `git push --no-verify` if no documented fact moved.
- **Immediately after `gh pr merge` succeeds:** run `/close-out` — close the bead(s), harvest lessons
  → `bd remember` (chat-first), delete this branch's `.git/sdd` scratch.
- **Hard rule:** never close a bead or delete `.git/sdd` scratch before the merge is confirmed. The
  bead is the "is it done?" truth; the scratch is the review loop's working context.
- **Epic completion = all beads closed. Full stop.** An epic/project is complete only when every one
  of its beads is closed — the plan bead, each task bead, and every follow-up bead filed during the
  work. A merged PR closes that PR's bead; it does **not** finish the epic while any follow-up bead
  remains open. Follow-ups are not optional and not owner-deferrable: file them and complete them
  within the epic. Before declaring an epic complete, list its beads and confirm none are open.
- **Multiple problems per session:** write each problem's ledger to
  `.git/sdd/$(git branch --show-current | tr '/' '-')/progress.md`, so a second problem never clobbers
  an in-flight one's scratch. `/close-out` deletes exactly that per-branch path.
- Hooks are committed in `.githooks/` (`core.hooksPath=.githooks`; enable once per clone:
  `git config core.hooksPath .githooks`). Nothing to install.

## Conventions & Patterns

**Review gate — `adversarial-review`.** Before merging substantial work, run the global
`adversarial-review` skill (guilty-until-proven, seven personas; defeats rubber-stamping where
generic review rubber-stamps). Scale the set to the diff — reach for the lens + engine that
matches what changed:

| Lens → engine | Invoke when the change touches… | Typical paths |
|---|---|---|
| **Security** → `vibe-security` | auth, access control, user input, secrets, API surface | `src/app/api/**`, `src/middleware.ts`, `**/*auth*` |
| **Data/Persistence** → `postgres-review` | schema, migrations, queries, indexes | `src/lib/db/**`, `drizzle/**`, `*.sql` |
| **Architect** → `system-design-review` | cross-layer seams, concurrency, idempotency, silent failures, type design | service/repo/route wiring |
| **Craftsman** → `ponytail` | any non-trivial logic (simplicity / YAGNI) | `**/*.ts`, `**/*.tsx` |
| **Graphic Design** → `DESIGN.md` | components, tokens, styling, theming | `**/*.tsx`, `**/*.css`, `tailwind*` |
| **UX** → `ui-ux-pro-max` | rendered UI, interaction, accessibility | `src/app/**/*.tsx` (view/page components) |
| **QA/Test** | new/changed behavior — and proof the test runs in CI | `**/*.test.ts`, `**/*.spec.ts`, `.github/**` |

The skill and its engines are global (personal `~/.claude/skills/`), so there's no per-repo setup.

**Testing:** DB-backed tests live in `src/lib/db/` behind `RUN_DB_TESTS=1`; they run serially in CI
via the `db-tests` job and locally via `npm run test:db`. A change with new tests must prove the
important ones execute in CI, and that at least one test crosses the real layers un-mocked.

## Design Context

Tone is governed by [`TONE.md`](TONE.md) — **first-order**: the app conforms to it, and an exception
is an amendment to that file, never a local override. Strategic design context lives in
[`PRODUCT.md`](PRODUCT.md) (register, users, purpose, brand personality, anti-references, design
principles, accessibility). Read both before any UI work.

**The one thing to internalize:** the purpose is **realizing what you love most** (affirmation), not
deciding what to discard — prefer "which do you love more?" over "keep or let go?"; letting go follows
naturally and is never the headline. Each object is a story, not a data row. Design is gentle,
judgement-free, and low-cognitive-load by duty of care, not taste. One decision at a time; never the
whole pile. No gamification (no confetti/streaks/scores), no shaming metrics ("too many"), no
catalog/inventory/shopping-site framing. Tablet-first, tap-first, **no swiping** (drag is OK where it
helps). Target WCAG 2.1 AA.

The `/impeccable` skill (and its sub-commands) reads `PRODUCT.md` automatically. The visual system is
defined in [`DESIGN.md`](DESIGN.md) — a deliberate palette, type,
elevation, and component system — and is accountable to [`TONE.md`](TONE.md).

## Wireframes (reference, not law)

`docs/Adored_wireframes.pdf` is a **starting reference, not a spec to match exactly.**
Deviate whenever a better flow serves the user — the governing authorities are
[`PRODUCT.md`](PRODUCT.md) (purpose) and [`TONE.md`](TONE.md) (first-order tone contract),
**not** the wireframes. When a wireframe and a better flow conflict, choose the better flow.

**Durable interaction principles (these hold regardless of any wireframe):**

- **Tablet-first, tap-first** — taps are the primary affordance; there is **no swiping**. Dragging is
  permitted where it genuinely helps (reordering, moving items between buckets). Touch targets ≥44px (h-11).
- **Navigation** — top-left back arrow + breadcrumb; top-right user area.

The wireframes per-screen layouts (collections grid, item grid, card-based sorting, bucketed results)
are useful reference, but the **flow may change** — e.g. uploading photos before metadata, deferring
metadata to fill in later, and bulk-uploading images.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
