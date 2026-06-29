// Automated accessibility scan (purses-sea). axe-core over the core screens in
// BOTH themes, asserting no serious/critical WCAG 2.x A/AA violations. This is
// the integration backstop the token-pairing unit test (src/lib/design/
// contrast.test.ts) can't be: it scans the *rendered* DOM (real computed colours,
// labels, roles, ARIA), so a bad combination can't pass by being omitted from a
// hand-curated list.
//
// Scope/limits: axe reliably covers text contrast (1.4.3), names, roles, labels.
// It does NOT reliably automate 1.4.11 non-text contrast — keep contrast.test.ts
// + the screenshot pass for those. We fail CI on serious|critical and merely
// report moderate|minor (the bead's "baseline-allow known minors"). Runs only on
// the tablet project: contrast/labels/roles are viewport-independent, so one pass
// is enough and keeps the gate fast.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  seedBaseline,
  seedSortScenario,
  seedMembersScenario,
  seedJourneyScenario,
} from "./fixtures/seed";

const FIXTURE = "e2e/fixtures/photos/IMG_0428.jpeg";
const THEMES = ["light", "dark"] as const;
// WCAG 2.0 + 2.1, levels A and AA — the conformance target in PRODUCT.md.
// (Best-practice rules are excluded so the gate fails only on real AA gaps.)
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

let slug = "";
let membersSlug = "";
let resultNumber = 0;
let triageSlug = "";
let triageSessionNumber = 0;

test.beforeAll(async () => {
  const ownerId = await seedBaseline();
  ({ slug, resultNumber } = await seedSortScenario(ownerId));
  ({ slug: membersSlug } = await seedMembersScenario(ownerId));
  ({ slug: triageSlug, sessionNumber: triageSessionNumber } = await seedJourneyScenario(ownerId, 3));
});

interface Finding {
  theme: string;
  screen: string;
  rule: string;
  impact: string;
  help: string;
  targets: string;
}

// Returns ALL violations (every impact). The caller fails on serious|critical and
// logs a by-impact summary — so the scan is provably live (not a silent no-op) and
// the moderate|minor backlog is visible without blocking CI.
async function scan(page: Page, theme: string, screen: string): Promise<Finding[]> {
  const { violations, passes } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  // Liveness + audit trail: a nonzero `passes` count proves axe analyzed the real
  // rendered DOM here, so this gate can never be a silent no-op that passes by
  // scanning nothing. (Investigated: every core screen reports ~21-24 passes.)
  // eslint-disable-next-line no-console
  console.log(`[a11y] ${screen}/${theme}: ${passes.length} checks passed, ${violations.length} violation(s)`);
  return violations.map((v) => ({
    theme,
    screen,
    rule: v.id,
    impact: v.impact ?? "",
    help: v.help,
    targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | "),
  }));
}

function blocking(all: Finding[]): Finding[] {
  return all.filter((f) => f.impact === "serious" || f.impact === "critical");
}

function report(findings: Finding[]): string {
  if (findings.length === 0) return "none";
  return findings
    .map((f) => `  [${f.impact}] ${f.rule} — ${f.screen} (${f.theme}): ${f.help}\n      ${f.targets}`)
    .join("\n");
}

async function setTheme(page: Page, theme: string): Promise<void> {
  // theme-script.tsx reads localStorage 'pi-theme' before paint — set it first.
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("pi-theme", t);
    } catch {
      /* storage blocked — falls back to light, fine */
    }
  }, theme);
}

for (const theme of THEMES) {
  test(`a11y: core authed screens — no serious/critical violations (${theme})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "tablet", "a11y is viewport-independent; scanned once on tablet");
    await setTheme(page, theme);
    // Real photo bytes so image-bearing screens render (no blob emulator locally).
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: FIXTURE, contentType: "image/jpeg" }),
    );

    const screens: [string, string][] = [
      ["collections", "/collections"],
      ["collection-workspace", `/collections/${slug}`],
      ["items", `/collections/${slug}/items`],
      ["item-detail", `/collections/${slug}/items/1`],
      ["results", `/collections/${slug}/results/${resultNumber}`],
      ["members", `/collections/${membersSlug}/members`],
      ["profile", "/profile"],
      ["triage", `/collections/${triageSlug}/sort/${triageSessionNumber}/triage`],
    ];

    const findings: Finding[] = [];
    for (const [name, url] of screens) {
      await page.goto(url);
      await page.getByRole("img").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(300); // brief settle for theme + fonts
      findings.push(...(await scan(page, theme, name)));
    }
    const fail = blocking(findings);
    expect(fail, `serious/critical a11y violations:\n${report(fail)}`).toEqual([]);
  });
}

for (const theme of THEMES) {
  test(`a11y: unauthenticated login/signup — no serious/critical violations (${theme})`, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "tablet", "a11y is viewport-independent; scanned once on tablet");
    // Log out (the project's storageState is signed in) so /login renders the
    // form rather than redirecting to /collections.
    await context.clearCookies();
    await setTheme(page, theme);

    const findings: Finding[] = [];
    for (const [name, url] of [["login", "/login"], ["signup", "/signup"]] as [string, string][]) {
      await page.goto(url);
      await page.waitForTimeout(300);
      findings.push(...(await scan(page, theme, name)));
    }
    const fail = blocking(findings);
    expect(fail, `serious/critical a11y violations:\n${report(fail)}`).toEqual([]);
  });
}
