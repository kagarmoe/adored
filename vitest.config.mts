import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    // A failing assertion aborts the test before any trailing cleanup line runs.
    // Without these, a leaked vi.stubEnv("NODE_ENV") or console spy cascades into
    // the following tests and one real failure reports as four.
    unstubEnvs: true,
    restoreMocks: true,
    // Unit tests live under src/. Keep vitest out of e2e/ — those are
    // Playwright specs that import @playwright/test and must not be collected
    // by the vitest runner (they'd throw "test() called outside Playwright").
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      // html -> browsable dashboard page; json-summary -> inline CI table;
      // text-summary -> CI log. Reflects unit/component tests only; the DB
      // integration suite runs in a separate job and is NOT counted here.
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["src/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Stub next/image in unit tests so URL normalization doesn't interfere.
      "next/image": path.resolve(__dirname, "./src/__mocks__/next-image.tsx"),
    },
  },
});
