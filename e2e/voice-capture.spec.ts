// e2e/voice-capture.spec.ts — voice-to-text smoke (purses-w2mt.8).
// Real STT can't run in CI, so this stubs window.SpeechRecognition via
// addInitScript (installed before hydration; the hook feature-detects the live
// window at mount, so the stub is what it finds). Scope is presence/wiring only —
// capture/merge behavior is covered by the RTL + unit tiers.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedTriageScenario } from "./fixtures/seed";

// Minimal inert SpeechRecognition stub: constructible, start/stop/abort no-ops.
const STUB = `
  class E2ESpeechRecognition {
    continuous = false; interimResults = false; lang = "";
    start() {} stop() { this.onend && this.onend(); } abort() {}
  }
  window.SpeechRecognition = E2ESpeechRecognition;
  window.webkitSpeechRecognition = E2ESpeechRecognition;
`;

test.describe("voice capture — smoke", () => {
  let slug: string;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    const scenario = await seedTriageScenario(ownerId); // 1 item (#1)
    slug = scenario.slug;
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(STUB);
  });

  test("edit form offers the capture mic, story mic, and Add size disclosure", async ({ page }) => {
    await page.goto(`/collections/${slug}/items/1/edit`);
    await expect(page.getByRole("button", { name: /add details by speaking/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /speak your story/i })).toBeVisible();
    // Dimensions live behind the quiet disclosure, collapsed by default.
    const addSize = page.getByRole("button", { name: /add size/i });
    await expect(addSize).toBeVisible();
    await expect(page.getByLabel(/width/i)).toBeHidden();
    await addSize.click();
    await expect(page.getByLabel(/width/i)).toBeVisible();
  });

  test("new-item form offers the capture mic", async ({ page }) => {
    await page.goto(`/collections/${slug}/items/new`);
    await expect(page.getByRole("button", { name: /add details by speaking/i })).toBeVisible();
  });
});
