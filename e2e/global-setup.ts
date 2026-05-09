import { execSync } from 'node:child_process'

// Tripwire: refuse to run the demo seed unless the caller explicitly opts in
// via ALLOW_DEMO_SEED=1. Without this flag, a stray DATABASE_URL pointing at
// production (e.g. shell creds left over from a one-off migration) would
// silently insert a demo collection in prod. The seed is idempotent so no
// data corruption, but a demo collection in prod is its own kind of mess.
//
// playwright.config.ts sets ALLOW_DEMO_SEED=1 in the webServer + globalSetup
// env, so local/CI dev-DB runs continue to work as before.
type SeedEnv = Record<string, string | undefined>

export function assertSeedAllowed(env: SeedEnv = process.env): void {
  if (!env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL must be set to run e2e tests — the demo globalSetup seeds via Prisma.',
    )
  }
  if (env.ALLOW_DEMO_SEED !== '1') {
    throw new Error(
      'e2e/global-setup: refusing to seed without ALLOW_DEMO_SEED=1 — set this only when running against a local/dev DB.',
    )
  }
}

// Seeds the demo collection (idempotent) so demo e2e tests have data.
// The seed script is keyed off Photo.originalBlobKey @unique, so re-running it
// is safe even when the dev DB already has the demo collection.
export default async function globalSetup() {
  assertSeedAllowed()
  execSync('npx tsx prisma/seed-demo.ts', { stdio: 'inherit' })
}
