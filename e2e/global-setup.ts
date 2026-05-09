import { execSync } from 'node:child_process'

// Seeds the demo collection (idempotent) so demo e2e tests have data.
// The seed script is keyed off Photo.originalBlobKey @unique, so re-running it
// is safe even when the dev DB already has the demo collection.
export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL must be set to run e2e tests — the demo globalSetup seeds via Prisma.',
    )
  }
  execSync('npx tsx prisma/seed-demo.ts', { stdio: 'inherit' })
}
