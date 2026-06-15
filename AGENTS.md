# Repository Guidelines

## Project Structure & Module Organization

Adored is a Next.js 14 App Router app. Main code lives in `src/`.
Use `src/app/` for pages and API routes, `src/features/` for feature components,
`src/components/` for shared UI and layout, `src/server/` for repositories and
services, `src/lib/` for utilities, database schema, and auth helpers, and
`src/types/` for domain types. Drizzle migrations live in `drizzle/`. Playwright
specs and fixtures live in `e2e/`; unit and component tests are colocated under
`src/` as `*.test.ts` or `*.test.tsx`.

## Build, Test, and Development Commands

- `npm run dev` - start the local Next.js dev server.
- `npm run build` - compile a production build.
- `npm start` - run the production build locally.
- `npm run lint` - run ESLint over TypeScript and TSX files.
- `npm run test:ci` - run Vitest; DB tests are skipped unless enabled.
- `npm run test:db` - run DB-backed tests using the local test harness.
- `npm run test:e2e` - run Playwright end-to-end tests.
- `npm run db:generate` / `npm run db:migrate` - generate and apply Drizzle migrations.

## Coding Style & Naming Conventions

Use TypeScript, React function components, and existing repository patterns before
adding new abstractions. Keep UI tablet-first and tap-friendly. Components use
PascalCase (`ItemCard.tsx`), hooks use `useX`, utilities use camelCase, and tests
mirror the file under test. Tailwind classes are the primary styling mechanism.

## Testing Guidelines

Vitest covers unit, service, API route, and jsdom component tests. Use
`// @vitest-environment jsdom` for component tests that render React. DB tests in
`src/lib/db/` are gated behind `RUN_DB_TESTS=1`; run them targeted or with
`--no-file-parallelism` to avoid shared database reset conflicts. Playwright uses
the `e2e/fixtures/test-db.sh` harness and production-style `next build && start`.

## Commit & Pull Request Guidelines

History follows terse conventional prefixes such as `fix(auth): ...`,
`feat(pool): ...`, `test(pool): ...`, and `docs: ...`, often with Beads IDs like
`[purses-82r]`. Keep commits scoped and avoid staging unrelated local changes.
PRs should explain root cause, user impact, validation, and linked Beads/GitHub
issues. UI PRs need light and dark screenshots when visuals change; see
`docs/cookbook/add-images-to-pr.md`.

## Security & Configuration Tips

Use Beads for repo memory and issue tracking: run `bd prime`, create/claim work
with `bd`, and store durable lessons with `bd remember`. Auth env names are
`AUTH_URL` and `AUTH_SECRET`; do not add Vercel system variables like `VERCEL` to
`.env.local`. Production DB migrations require an explicit prod `DATABASE_URL`.
