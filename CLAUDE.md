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

Use the **superpowers** workflow for substantive work: `brainstorming` → `writing-plans` →
`executing-plans`, with `test-driven-development` and `systematic-debugging`. Track work in **beads**
(`bd`), never TodoWrite. Then close out properly — the two steps most easily skipped are gates, not
optional:

- **Branch:** feature branch off `main` → PR → squash-merge → Vercel auto-deploys prod. Never commit
  directly to `main`.
- **Isolate concurrent work:** multiple agents may run here at once, and a branch switch in a *shared*
  working tree silently discards another agent's uncommitted changes. For substantial or parallel work,
  branch into your own git worktree (or the `EnterWorktree` tool); never switch branches with
  uncommitted changes (commit or stash first).
- **Commit:** frequent, one logical change per commit; don't leave work parked only in the working tree.
- **Verify before claiming done:** run the gates above. Evidence before assertions
  (`superpowers:verification-before-completion`).
- **Code review is a GATE before merging any major feature** — run the `adversarial-review` skill (see
  the lens→engine routing under *Conventions & Patterns* below), optionally alongside
  `superpowers:requesting-code-review`. Do not merge a major feature without it.
- **Close the branch with `superpowers:finishing-a-development-branch`** — don't hand-roll the
  merge/cleanup.

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
