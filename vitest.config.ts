import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
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
