# Agent Guide

This repository is **Adored**, a Next.js App Router application.

`CLAUDE.md` is the authoritative workflow and project-instruction file for agents in this repo. Read it before making repo-specific assumptions. This file is a concise orientation layer for agents that look for `AGENTS.md`; it should point to the canonical rules, not duplicate them.

## Start Here

1. Read `CLAUDE.md`.
2. Run `bd prime` if you need the full Beads workflow context.
3. Check the current branch and worktree before editing:

```bash
git status --short --branch
```

## Project Shape

- App framework: Next.js App Router in `src/app/`.
- Language: TypeScript with strict checks.
- UI: React/Next.js function components, Tailwind classes, existing components in `src/components` and `src/features`.
- Data: Drizzle/Postgres through server-side controllers, services, and repositories.
- Auth: better-auth with Google-only product login; see `src/lib/auth-server.ts` and `src/lib/auth.ts`.
- Design authorities: `TONE.md`, `PRODUCT.md`, and `DESIGN.md`.

## Workflow

- Track work in Beads (`bd`), not ad hoc TODO files.
- For substantive work, follow the Superpowers workflow described in `CLAUDE.md`: spec, review, plan, implementation, review, verification.
- Pick model strength / reasoning effort per task using the **Agent Models** table in `CLAUDE.md` (high effort only for review, architecture, and hard debugging).
- Prefer the repo's existing patterns over new abstractions.
- Preserve unrelated local changes. Do not reset or revert user work unless explicitly asked.
- Create a feature branch off `main` for code or docs changes. Do not push unless asked.

## Verification

Use the gates in `CLAUDE.md` for the level of change:

```bash
npm run lint
npm run test:ci
npm run build
npm run auth:verify
npm run test:db
```

For docs-only changes, run the smallest meaningful checks and report what was not run. Before pushing a PR branch, follow the repo's doc-sync and graphify guidance in `CLAUDE.md`.

## Keep This File Small

If an instruction belongs to the durable workflow, put it in `CLAUDE.md`. If it is product tone or design policy, keep it in `TONE.md`, `PRODUCT.md`, or `DESIGN.md`. `AGENTS.md` should stay short enough that agents reliably read it.
