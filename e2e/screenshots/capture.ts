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
import {
  seedBaseline,
  seedSortScenario,
  seedMembersScenario,
  seedJourneyScenario,
  seedWorkspaceStates,
} from "../fixtures/seed";
import { getTestDb } from "../fixtures/db";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { ItemDispositionRepository } from "@/server/repositories/implementations/ItemDispositionRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";

// A real photo so the shots show a real rendered image, not a placeholder.
const FIXTURE = "e2e/fixtures/photos/IMG_0428.jpeg";

let slug = "";
let membersSlug = "";
let resultNumber = 0;
let triageSlug = "";
let triageSessionNumber = 0;
let waitingSlug = "";
let waitingSessionNumber = 0;
let setAsideSlug = "";
let pausedSlug = "";
let workspacePoolFirstSlug = "";
let workspaceItemsFirstSlug = "";

test.beforeAll(async () => {
  const ownerId = await seedBaseline();
  ({ slug, resultNumber } = await seedSortScenario(ownerId));
  // A collection with real owner + curator membership rows so the members shot
  // shows the RoleBadge (the baseline seed inserts collections without them).
  ({ slug: membersSlug } = await seedMembersScenario(ownerId));

  // Epic C PR1: an UNTRIAGED journey so the triage shot shows the focused item,
  // the four tiers, and the quiet "Not yet" defer action below the hairline.
  ({ slug: triageSlug, sessionNumber: triageSessionNumber } =
    await seedJourneyScenario(ownerId, 3));

  // Epic C PR1: the patient-waiting state. A 2-item journey where item A is
  // already triaged (a preference row) and item B is deferred — so the ONLY
  // remaining untriaged item is deferred → selectTriageItem sets showingDeferred
  // and the "Ready when you are" banner renders.
  const waiting = await seedJourneyScenario(ownerId, 2);
  waitingSlug = waiting.slug;
  waitingSessionNumber = waiting.sessionNumber;
  const { db } = getTestDb();
  await new CollectionPreferenceItemRepository(db).create({
    collectionId: waiting.collectionId,
    curatorId: ownerId,
    itemId: waiting.itemIds[0],
    score: 0.875,
    confidence: 0.1,
    rankBucket: "top",
    comparisonCount: 1,
  });
  await new ItemDispositionRepository(db).upsert({
    collectionId: waiting.collectionId,
    curatorId: ownerId,
    itemId: waiting.itemIds[1],
    disposition: "deferred",
  });

  // Epic C PR2: the count-free "Set aside" list. A 2-item journey where one item
  // carries a `set_aside` disposition — so the list renders one Card row (cover +
  // name + "Bring back"), not the EmptyState. Mirrors the patient-waiting seed.
  const setAside = await seedJourneyScenario(ownerId, 2);
  setAsideSlug = setAside.slug;
  await new ItemDispositionRepository(db).upsert({
    collectionId: setAside.collectionId,
    curatorId: ownerId,
    itemId: setAside.itemIds[0],
    disposition: "set_aside",
  });

  // Epic C PR3: the calm PAUSED sort landing. A journey whose session is flipped
  // to `paused` (mirrors the patient-waiting/set-aside seeds upserting state) so
  // /sort renders the calm "Your sort is paused" card with Resume, and gates the
  // "New Session" button (purses-4bhh).
  const paused = await seedJourneyScenario(ownerId, 2);
  pausedSlug = paused.slug;
  const pausedSession = await new SessionRepository(db).findActive(
    paused.collectionId,
    ownerId,
  );
  if (!pausedSession) throw new Error("capture: paused seed had no active session to pause");
  await new SessionRepository(db).update(pausedSession.id, { status: "paused" });

  // Task 6 (adaptive workspace): the two adaptive shapes reviewers compare —
  // pool-first (loose pool photos drive the page) and items-first (no pool, items
  // only). Placeholder blobKeys ride the same /file intercept as every other shot.
  const workspace = await seedWorkspaceStates(ownerId);
  workspacePoolFirstSlug = workspace.poolOnly.slug;
  workspaceItemsFirstSlug = workspace.itemsOnly.slug;
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
      // pv9 PR2 (purses-o93): the redesigned results page — most-loved hero +
      // "The full ranking" + the SEPARATE forward-framed Onward section ("Where
      // these go next"), no per-tier count grid. seedSortScenario buckets one
      // item to `low`, so the Onward section actually renders here.
      ["results", `/collections/${slug}/results/${resultNumber}`],
      // pv9 PR8 + PR1b (purses-c0w): members page renders MemberList (RoleBadge —
      // Owner/Curator on the existing Badge variants) + email-only InviteForm.
      // Points at the seedMembersScenario collection so real role rows render.
      ["members", `/collections/${membersSlug}/members`],
      // PR1a (purses-wew): editable display-name profile (no image — the img
      // wait below just times out harmlessly via .catch).
      ["profile", "/profile"],
      // Epic C PR1: triage with the "Not yet" defer affordance + person-side
      // prompt, and the patient-waiting "Ready when you are" resurfacing state.
      ["triage", `/collections/${triageSlug}/sort/${triageSessionNumber}/triage`],
      ["triage-patient-waiting", `/collections/${waitingSlug}/sort/${waitingSessionNumber}/triage`],
      // Epic C PR2: the count-free "Set aside" list — one set-aside item (cover +
      // name + quiet "Bring back"), reached from triage's quiet "Set aside" link.
      ["set-aside", `/collections/${setAsideSlug}/sort/set-aside`],
      // Epic C PR3: the calm PAUSED sort landing — "Your sort is paused" + "Your
      // sort is safe — pick up where you left off" + Resume, with "New Session"
      // gated (purses-4bhh). Reached after "Take a break" in the sort chrome.
      ["sort-paused", `/collections/${pausedSlug}/sort`],
      // purses-ydeu: the same paused session, now surfaced on the COLLECTION page.
      // It used to show no card (active-only); now ActiveSessionPanel renders the
      // status-aware paused card ("Your sort is paused" / "Your sort is safe") with
      // a real un-pause Resume. Reuses the pausedSlug seed above.
      ["collection-paused", `/collections/${pausedSlug}`],
      // Task 6: the adaptive workspace's two image-bearing shapes. pool-first
      // leads with the Photo pool preview (+ Make items); items-first leads with
      // the Items grid (+ the dominant Add photos action).
      ["workspace-pool-first", `/collections/${workspacePoolFirstSlug}`],
      ["workspace-items-first", `/collections/${workspaceItemsFirstSlug}`],
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
