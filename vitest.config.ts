import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Boots the local Prisma Dev (pglite) test server and pushes schema once
    // per `vitest run`. See `vitest.global-setup.ts` and `lib/test-db.ts`.
    globalSetup: ['./vitest.global-setup.ts'],
    globals: true,
    // Tests that touch the real test DB share one Postgres-compatible server
    // and TRUNCATE between cases. Parallel files would race on those truncates.
    fileParallelism: false,
    // Exclude playwright specs (they run via `playwright test`, not vitest)
    // but keep e2e/**/*.test.ts available for unit-testing helpers like
    // global-setup's seed guard.
    exclude: ['**/node_modules/**', 'e2e/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
