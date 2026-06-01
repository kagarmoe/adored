import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Unit tests live under src/. Keep vitest out of e2e/ — those are
    // Playwright specs that import @playwright/test and must not be collected
    // by the vitest runner (they'd throw "test() called outside Playwright").
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
