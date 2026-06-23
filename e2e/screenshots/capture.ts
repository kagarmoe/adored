// PR screenshot capture (NOT part of the e2e gate — testMatch excludes `*.ts`
// that isn't `*.spec.ts`; this runs only via `npm run screenshots`, which points
// playwright at playwright.screenshots.config.ts).
//
// Produces light + dark shots of the image-bearing surfaces on tablet + phone,
// into pr-screenshots/ (gitignored). Reuses the e2e harness: throwaway Docker
// DB, the baseline logged-in user (storageState), and the same /file intercept
// every image spec uses (no blob emulator locally).
//
// Then follow docs/cookbook/add-images-to-pr.md to release + embed them.
import { test } from "@playwright/test";
import { seedBaseline, seedSortScenario, seedMembersScenario } from "../fixtures/seed";

// A real photo so the shots show a real rendered image, not a placeholder.
const FIXTURE = "e2e/fixtures/photos/IMG_0428.jpeg";

let slug = "";
let membersSlug = "";

test.beforeAll(async () => {
  const ownerId = await seedBaseline();
  ({ slug } = await seedSortScenario(ownerId));
  // A collection with real owner + curator membership rows so the members shot
  // shows the RoleBadge (the baseline seed inserts collections without them).
  ({ slug: membersSlug } = await seedMembersScenario(ownerId));
});

for (const theme of ["light", "dark"] as const) {
  test(`capture ${theme}`, async ({ page }, testInfo) => {
    // theme-script.tsx reads localStorage 'pi-theme' before paint — set it first.
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("pi-theme", t);
      } catch {
        /* storage blocked — falls back to light, fine */
      }
    }, theme);
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: FIXTURE, contentType: "image/jpeg" }),
    );

    const proj = testInfo.project.name;
    const surfaces: [string, string][] = [
      ["collections", "/collections"],
      ["items-grid", `/collections/${slug}/items`],
      ["item-detail", `/collections/${slug}/items/1`],
      // pv9 PR8 + PR1b (purses-c0w): members page renders MemberList (RoleBadge —
      // Owner/Curator on the existing Badge variants) + email-only InviteForm.
      // Points at the seedMembersScenario collection so real role rows render.
      ["members", `/collections/${membersSlug}/members`],
      // PR1a (purses-wew): editable display-name profile (no image — the img
      // wait below just times out harmlessly via .catch).
      ["profile", "/profile"],
    ];
    for (const [name, url] of surfaces) {
      await page.goto(url);
      // Best-effort wait for the first image to paint, then a brief settle.
      await page
        .getByRole("img")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 })
        .catch(() => {});
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `pr-screenshots/${name}-${theme}-${proj}.png`,
        fullPage: true,
      });
    }
  });
}
