<!-- BEGIN swamp managed section - DO NOT EDIT -->
# Project

This repository is managed with [swamp](https://github.com/swamp-club/swamp).

## Rules

1. **Search before you build.** When automating AWS, APIs, or any external service: (a) search community extensions with `swamp extension search <query>` — prefer `@swamp/*` official extensions first, (b) search local/installed types with `swamp behavior type search <query>`, (c) if a community extension exists, install it with `swamp extension pull <package>` instead of building from scratch, (d) extend an existing type if it covers the domain but lacks the method you need, (e) only create a custom extension behavior in `extensions/models/` as a last resort. Use the `swamp` skill for guidance. The `command/shell` behavior is ONLY for ad-hoc one-off shell commands, NEVER for wrapping CLI tools or building integrations.
2. **Extend, don't be clever.** When a behavior covers the domain but lacks the method you need, extend it with `export const extension` — don't bypass it with shell scripts, CLI tools, or multi-step hacks. One method, one purpose. Use `swamp behavior type describe <type> --json` to check available methods.
3. **Use the data model.** Once data exists in a behavior (via `lookup`, `start`, `sync`, etc.), reference it with CEL expressions. Don't re-fetch data that's already available.
4. **CEL expressions everywhere.** Wire behaviors together with CEL expressions. Always prefer `data.latest("<name>", "<dataName>").attributes.<field>` over the deprecated `model.<name>.resource.<spec>.<instance>.attributes.<field>` pattern.
5. **Verify before destructive operations.** Always `swamp behavior get <name> --json` and verify resource IDs before running delete/stop/destroy methods.
6. **Prefer fan-out methods over loops.** When operating on multiple targets, use a single method that handles all targets internally (factory pattern) rather than looping N separate `swamp behavior run` calls against the same behavior. Multiple parallel calls against the same behavior contend on the per-behavior lock, causing timeouts. A single fan-out method acquires the lock once and produces all outputs in one execution. Check `swamp behavior type describe` for methods that accept filters or produce multiple outputs.
7. **Extension npm deps are bundled, not lockfile-tracked.** Swamp's bundler inlines all npm packages (except zod) into extension bundles at bundle time. `deno.lock` and `package.json` do NOT cover extension behavior dependencies — this is by design. Always pin explicit versions in `npm:` import specifiers (e.g., `npm:lodash-es@4.17.21`).
8. **Reports for reusable data pipelines.** When the task involves building a repeatable pipeline to transform, aggregate, or analyze behavior output (security reports, cost analysis, compliance checks, summaries), create a report extension. Use the `swamp` skill for guidance.
9. **"Workflow" means a swamp workflow.** In this repository the word "workflow" (and "create/run/execute/validate/debug workflow", "automate", "orchestrate", "automated/nightly job") refers to a swamp workflow — a declarative YAML DAG of behavior-method steps authored via `swamp workflow create`. Load and follow the `swamp` skill for these requests. Do NOT interpret these as a request to build an agent task list, spin up worktrees, or schedule a cron/remote agent. Only use those orchestration mechanisms when the user explicitly names one (e.g. "task list", "subagent", "worktree", "cron", "remote agent") or explicitly asks you to do the work yourself step by step rather than author a swamp workflow.
10. **Use swamp, don't bypass it.** Always work through swamp commands — don't go around them with raw shell tools. Use `swamp data query` to find data, not `grep`/`find` on `.swamp/` files. Use behavior methods to interact with resources, not `curl`/`aws`/`gcloud`/`kubectl` when a behavior type already wraps that API — check with `swamp behavior type search`. Use `swamp help` for CLI discovery, not guesswork. Composing with swamp output is fine (e.g. piping `--json` through `jq`) — the anti-pattern is bypassing swamp entirely.
11. **Inspect reports after failures.** When a behavior method or workflow run fails, inspect its generated reports before retrying or changing definitions. Reports run even on failure and capture structured diagnostics — error messages, execution status, arguments, and data output pointers. Use `swamp report get @swamp/method-summary --model <model> --json` for method failures or `swamp report get @swamp/workflow-summary --workflow <workflow> --json` for workflow failures. Run `swamp help report get` to confirm current retrieval syntax.

## Skills

**IMPORTANT:** Always load swamp skills, even when in plan mode. The skills provide
essential context for working with this repository.

- `swamp` - Swamp CLI — behaviors, workflows, data, vaults, extensions, publishing, repos, reports, issues, and troubleshooting
- `swamp-getting-started` - Interactive onboarding for new swamp users

## Getting Started

If you were asked to read a task brief under `tasks/` (a file whose first
line is `<!-- swamp start brief v1 -->`), read that brief, then invoke the
`swamp-getting-started` skill and follow it from its brief entry point.

If the user is new to swamp or asks to get started, or a swamp command you
run shows this repository has no behaviors yet, invoke the
`swamp-getting-started` skill. It checks for existing behaviors itself and walks
new users through an interactive onboarding tutorial.

Otherwise, use the `swamp` skill to work with swamp behaviors.

## Commands

Use `swamp --help` to see available commands. For a machine-readable JSON
schema of the CLI (commands, options, arguments) intended for agent
consumption, run `swamp help [<command>...]` — e.g. `swamp help` returns
the full tree, and `swamp help behavior run` scopes to a subtree.

Behaviors (formerly models) are managed with `swamp behavior` — e.g.
`swamp behavior run <name> <method>` (or
`swamp behavior run @<type> <method> <name>` to run against a type
directly). Every `swamp model …` spelling remains supported.
<!-- END swamp managed section -->

# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

## Communication preferences

Be brief.

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

## Agent Models

Match model strength to the task. Running the largest model on every subagent was this repo's
biggest token cost; reserve it for judgment.

| Task | Claude (subagent `model:`) | Codex (reasoning effort) |
|---|---|---|
| Judgment: adversarial-review personas, spec review, architecture decisions, systematic-debugging of non-obvious bugs | `opus` | `high` |
| Executing a written plan step, writing tests to a spec, routine edits | `sonnet` | `medium` |
| Searches and read-only sweeps | `haiku` (or the Explore agent) | `low` |

- If a task fits no row, don't set a model — let the agent type use its own default.
- Use aliases (`opus`, `sonnet`, `haiku`), never pinned versions, so this stays current.

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

**Profile: Team-maintainer.** This repository opts in: agents may commit, push, open PRs, merge, and
run `/close-out` when finishing a branch, unless the user says otherwise.

## Build & Test

Gates (CI runs all five; the pre-push hook mirrors lint + test:ci + build). A docs/config-only change
(everything outside `.github/code-paths.json`'s code set: `*.md`, `.claude/`, `.beads/`, `.githooks/`,
`.gitignore`, `graphify-out/`) gets only `npm run lint:md`, in CI and in the hook:

```bash
npm run build         # next build
npm run test:ci       # unit tests
npm run lint          # eslint
npm run lint:md       # markdownlint-cli2, broken-Markdown rules only (.markdownlint-cli2.jsonc)
npm run auth:verify   # auth wiring check
npm run test:db       # DB-backed tests (Docker; RUN_DB_TESTS=1)
npm run test:db:changed  # test:db only if DB-relevant files changed vs origin/main
```

**Local pre-PR verification is mandatory.** CI minutes are scarce; CI should confirm local evidence,
not discover predictable failures. Before opening or updating a PR, run the complete local gate set
for the branch's blast radius and record the exact commands/results in the PR body or handoff:

**Run it as the swamp workflow** (records every gate's exit code as queryable data; the verdict
asserts name every failing gate):

```bash
swamp workflow run adored-pre-pr --input "phoneSpecs=e2e/<spec>.spec.ts" --input "shots=<surface>,<surface>"
```

It runs lint, auth:verify, unit (coverage), build, the swamp-extension Deno type-check and tests,
test:db:changed (skips when no file in `.github/db-test-paths.json` changed), the full tablet e2e suite, then the phone specs and screenshots you pass (empty = skipped).
Per-gate results: `swamp data query 'modelName == "adored-tests"' --json`. The individual commands:

- **Every code PR:** `npm run lint`, `npm run test:ci`, and `npm run build`.
- **Auth/session/proxy/env changes:** also run `npm run auth:verify`.
- **DB/schema/repository/service/API persistence changes:** also run `npm run test:db` (or
  `npm run test:db:changed`, which skips when no DB-relevant path changed).
- **UI, page, route-flow, onboarding/tutorial, copy, responsive, or interaction changes:** run the
  mapped Playwright spec(s) locally, for example
  `npm run test:e2e -- e2e/welcome-walkthrough.spec.ts --project=tablet`.
- **Broad/unknown UI blast radius:** run `npm run test:e2e` locally instead of relying on CI's
  selective Playwright mapping.
- **Phone/responsive changes:** run the mapped Playwright spec with `PW_VIEWPORT=phone` as well as
  the default tablet project. Add desktop only when the change is desktop-specific.

## Align with Next.js Opinions (REQUIRED)

Next.js is opinionated. Follow its conventions, not workarounds:

1. **App Router** — Use `src/app/` with file-based routing. Never Pages Router.
2. **Server Components by default** — Mark interactive UI `"use client"` only when needed (forms, hooks like `useState`)
3. **Data fetching in Server Components** — Async functions in Server Components, never in Client Components
4. **API Routes for mutations** — All POST/PATCH/DELETE via `src/app/api/` routes, no direct DB calls from client
5. **Native fetch()** — No SWR/React Query; use `fetch()` with error handling
6. **better-auth integration** — Server config in `src/lib/auth.ts` / `src/lib/auth-server.ts`, client in `src/lib/auth-client.ts`, handler at `src/app/api/auth/[...all]`; follow those patterns
7. **Proxy for route protection** — optimistic login redirect in `src/proxy.ts` (Next 16 convention; was middleware.ts); real authz lives in the DAL guards
8. **Suspense for async UI** — Stream loading states with React Suspense
9. **No hardcoded secrets** — All config via `process.env.*` with validation at module load
10. **TypeScript strict mode** — All inference errors resolved, no `any`

## Code Quality

- **Comments on WHY only** — Code is self-documenting via naming
- **No premature abstraction** — Three lines before helper; DRY within reason
- **Validate at boundaries** — *input validation*, not test scope: re-check untrusted data (user input, external APIs) at the edge; don't re-validate trusted internal call results. Testing is separate and broad — see Build & Test.
- **Follow auth patterns** — API routes, error responses, validation precedent already set

## Development process

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

**Git discipline:**
- **Branch:** feature branch off `main` → PR → squash-merge → Vercel auto-deploys prod. Never commit
  directly to `main`.
- **Isolate concurrent work:** a branch switch in a *shared* working tree silently discards another
  agent's uncommitted changes. For substantial/parallel work, branch into your own git worktree (or
  `EnterWorktree`); never switch branches with uncommitted changes (commit or stash first).
- **Commit:** frequent, one logical change per commit; don't park work only in the working tree.
- **Commit and PR style:** Conventional Commits (`type(scope): summary`) for commits and PR titles.
  Write messages and PR bodies in Simplified Technical English (STE): short sentences, active voice,
  one idea per sentence. Be brief.

## PR lifecycle automation

- **Before pushing / opening a PR:** complete the local pre-PR verification above, run `/sync-docs`
  (update the governance docs this branch's changes affect, per `docs/doc-ownership.md`; never
  PRODUCT/TONE), and `/graphify --update` (refresh the committed graph). The `.githooks/pre-push`
  doc-sync step soft-blocks a code push whose mapped docs weren't touched — run `/sync-docs`, or
  `git push --no-verify` if no documented fact moved.
- **Before a UI PR is ready for review:** add inline PR images using
  [`docs/cookbook/add-images-to-pr.md`](docs/cookbook/add-images-to-pr.md). Include light + dark
  screenshots for every changed surface. Include phone screenshots when phone/responsive behavior
  changed. It is acceptable to open a draft PR first to get the PR number required by the release
  asset workflow, but do not ask for review without the images or an explicit blocker.
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
| **Security** | auth, access control, user input, secrets, API surface | `src/app/api/**`, `src/proxy.ts`, `**/*auth*` |
| **Data/Persistence** → `postgres-review` | schema, migrations, queries, indexes | `src/lib/db/**`, `drizzle/**`, `*.sql` |
| **Architect** → `system-design-review` | cross-layer seams, concurrency, idempotency, silent failures, type design | service/repo/route wiring |
| **Craftsman** → `ponytail` | any non-trivial logic (simplicity / YAGNI) | `**/*.ts`, `**/*.tsx` |
| **Graphic Design** → `DESIGN.md` | components, tokens, styling, theming | `**/*.tsx`, `**/*.css`, `tailwind*` |
| **UX** | rendered UI, interaction, accessibility | `src/app/**/*.tsx` (view/page components) |
| **QA/Test** | new/changed behavior — and proof the test runs in CI | `**/*.test.ts`, `**/*.spec.ts`, `.github/**` |

`adversarial-review`, `system-design-review`, and `postgres-review` are personal global skills;
`ponytail` is a plugin. No per-repo setup.

**Testing:** DB-backed tests live in `src/lib/db/` behind `RUN_DB_TESTS=1`; they run serially in CI
via the `db-tests` job and locally via `npm run test:db`. Both CI and `test:db:changed` run them only
when a path in `.github/db-test-paths.json` changed; `scripts/test-db-if-changed.test.ts` fails if
the suite's imports (pages' UI imports excluded) escape that list; CI always runs them on a push to `main`. A change with new tests must prove the
important ones execute in CI, and that at least one test crosses the real layers un-mocked.

## Design Context

Read [`PRODUCT.md`](PRODUCT.md) and [`TONE.md`](TONE.md) before any UI work (both v2, 2026-10-01;
the stricter v1 contracts are archived under `docs/archive/`). They are guides, not contracts: good
design judgement fills the gaps.

**The one thing to internalize:** Adored is **pre-marketplace**. It should feel like the resale
apps people already know (eBay, Poshmark, Vinted, Vestiaire) with the sales pressure removed and
some coziness added. Borrow familiar layouts: item cards in a grid, an item page with a photo
carousel beside editable details, filters, overflow menus. The purpose is **realizing what you love
most** (affirmation), not culling; prefer "which would you reach for first?" over "keep or toss?".
Gentle, reversible, photo-first. One decision in focus at a time. Still off the table: gamification
(confetti/streaks/scores), shaming metrics ("too many"), and shopping language (buy/cart/offer/price).
Tablet-first, phone-ready; taps primary, swipe fine where native (carousels, dismiss), drag where it
helps (reordering, moving items between buckets). Touch targets ≥44px (`h-11`). WCAG 2.1 AA.

The `/impeccable` skill (and its sub-commands) reads `PRODUCT.md` automatically. The visual system is
defined in [`DESIGN.md`](DESIGN.md) — palette, type, elevation, components — and follows `TONE.md`.

## Wireframes (reference, not law)

The wireframes in [`docs/design-system/`](docs/design-system/) (`Adored Tablet Wireframes.dc.html`,
`Adored Phone Wireframes.dc.html`) are a **starting reference, not a spec to match exactly.**
Deviate whenever a better flow serves the user — the governing authorities are
[`PRODUCT.md`](PRODUCT.md) (purpose) and [`TONE.md`](TONE.md) (feel),
**not** the wireframes. When a wireframe and a better flow conflict, choose the better flow.

**Durable navigation (holds regardless of any wireframe):** top-left back arrow + breadcrumb;
top-right user area. Interaction principles are under Design Context.

The wireframes per-screen layouts (collections grid, item grid, card-based sorting, bucketed results)
are useful reference, but the **flow may change** — e.g. uploading photos before metadata, deferring
metadata to fill in later, and bulk-uploading images.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- Refresh the committed graph with `/graphify --update` before pushing (see PR lifecycle).
