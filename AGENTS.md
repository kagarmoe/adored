<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Tests

See [`TESTING.md`](TESTING.md) for the full map. Quick version:

- `npm test` — Vitest unit/integration, runs anywhere. **DB-touching code uses the real test DB by default** via `lib/test-db.ts` (a pglite Postgres `vitest.global-setup.ts` boots automatically). `vi.mock('@/lib/db')` is reserved for the narrow cases TESTING.md lists; if you use it, the test must include a comment saying which case applies and why. The structural reason: the 2026-05-15 demo-500 was a column-rename that escaped a suite full of `vi.mock('@/lib/db')` tests — a mocked Prisma has whatever shape the test pretends, so schema drift is invisible. See **purses-chh.3** + `lib/__tests__/schema-drift.test.ts`.
- `npm run e2e` — Playwright; needs Postgres + browsers. **Runs in CI**
  (`.github/workflows/e2e.yml`), not in the polecat sandbox. Trigger
  on-demand with `gh workflow run e2e.yml [--ref <branch>]`.
- `npm run smoke` — post-deploy probe against the live Vercel deploy

**Do not "skip e2e because the sandbox can't run it."** Push your branch —
the workflow fires on push and gives you a real report.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
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

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
