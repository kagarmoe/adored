// Dedicated config for `npm run screenshots` — reuses the e2e harness (Docker
// DB via globalSetup, baseline auth via the setup project + storageState,
// build+start webServer) but runs ONLY e2e/screenshots/capture.ts on tablet +
// phone. Kept separate from playwright.config.ts so the screenshot run never
// joins the CI e2e gate.
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: ["**/auth.setup.ts", "**/screenshots/capture.ts"],
  reporter: [["list"]],
  // setup (auth) + the two viewports the cookbook reviews. Desktop omitted.
  projects: base.projects!.filter((p) => ["setup", "tablet", "phone"].includes(p.name!)),
});
