import '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { TEST_DATABASE_URL } from './lib/test-db'

// Pin DATABASE_URL to the local Prisma Dev (pglite) test server BEFORE any
// test code imports `@/lib/db` — `db.ts` reads `process.env.DATABASE_URL` at
// module load time. This is what lets real-DB tests just `import { db } from
// '@/lib/db'` instead of vi.mocking it. See `docs/TESTING.md`.
//
// Hard-overriding here (not `??=`) protects against a developer accidentally
// running `npm test` with a real DATABASE_URL exported in their shell.
process.env.DATABASE_URL = TEST_DATABASE_URL
