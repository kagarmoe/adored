import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    // Unit tests live under src/. Keep vitest out of e2e/ — those are
    // Playwright specs that import @playwright/test and must not be collected
    // by the vitest runner (they'd throw "test() called outside Playwright").
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
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
    },
  },
});
