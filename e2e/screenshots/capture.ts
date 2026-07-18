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
import { test, expect } from "@playwright/test";
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
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";

// A real photo so the shots show a real rendered image, not a labeled test card.
const FIXTURE = "public/onboarding/blue-mixing-bowl.webp";

let slug = "";
let membersSlug = "";
let resultNumber = 0;
let finalizedResultNumber = 0;
let ownerId = "";
let waitingSlug = "";
let waitingSessionNumber = 0;
let setAsideSlug = "";
let pausedSlug = "";
let workspacePoolFirstSlug = "";
let workspaceItemsFirstSlug = "";

test.beforeAll(async () => {
  ownerId = await seedBaseline();
  ({ slug, resultNumber, finalizedResultNumber } = await seedSortScenario(ownerId));
  // A collection with real owner + curator membership rows so the members shot
  // shows the RoleBadge (the baseline seed inserts collections without them).
  ({ slug: membersSlug } = await seedMembersScenario(ownerId));


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

  // Epic 2: a story on the waiting collection's item 1 so the item-detail shot
  // shows the soft-violet keepsake card ("Where will it go next?").
  await new ItemRepository(db).update(waiting.itemIds[0], {
    story:
      "To my niece, who always borrowed it for weekend trips — I hope it carries her somewhere good.",
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
    // Seeded PER TEST, not in beforeAll (purses-z23h): the usage-round recap block below
    // ANSWERS every queued item, draining the queue. A seed shared across the light and
    // dark runs left the second one with an empty queue (no "Quick pace", no usage round
    // on the hub, then a timeout). beforeAll would not fix it either — it does not re-run
    // on a Playwright retry, so a retried attempt would re-consume the drained queue.
    const { slug: triageSlug, sessionNumber: triageSessionNumber } =
      await seedJourneyScenario(ownerId, 3);

    // theme-script.tsx reads localStorage 'pi-theme' before paint — set it first.
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("pi-theme", t);
        // Epic 4: a round box so the round surfaces show the violet timer
        // (round-preference defaults to "none" / no timer when unset). "120"
        // (2 minutes) is the default.
        localStorage.setItem("pi-round-box", "120");
      } catch {
        /* storage blocked — falls back to light, fine */
      }
    }, theme);
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: FIXTURE, contentType: "image/webp" }),
    );

    // purses-r4it: assert the precondition z23h violated, before any file is written.
    // Every usage surface below needs an UNANSWERED queue; the recap block at the end
    // of this test answers it out. A seed shared across the two themes (or one hoisted
    // into beforeAll, which does not re-run on retry) leaves this empty, and the shots
    // silently capture the recap instead of the round. Fail here, loudly and in seconds,
    // rather than 30s later on a "Quick pace" click timeout with garbage already on disk.
    await page.goto(`/collections/${triageSlug}/sort/${triageSessionNumber}/usage`);
    await expect(
      page.getByRole("button", { name: "Yes, I use it" }),
      'usage queue is drained — the journey seed must be PER TEST (purses-z23h), not shared across themes',
    ).toBeVisible({ timeout: 15_000 });

    const proj = testInfo.project.name;
    const surfaces: [string, string][] = [
      ["collections", "/collections"],
      ["items-grid", `/collections/${slug}/items`],
      ["item-detail", `/collections/${slug}/items/1`],
      // Epic 2: item detail LEADING with the keepsake story card.
      ["item-detail-story", `/collections/${waitingSlug}/items/1`],
      // pv9 PR2 (purses-o93): the redesigned results page — most-loved hero +
      // "The full ranking" + the SEPARATE forward-framed Onward section ("Where
      // these go next"), no per-tier count grid. seedSortScenario buckets one
      // item to `low`, so the Onward section actually renders here.
      ["results", `/collections/${slug}/results/${resultNumber}`],
      // Epic S: the FINALIZED ("Saved") result — same composition, usage chips read
      // from the frozen sort_result_items.usage snapshot.
      ["results-finalized", `/collections/${slug}/results/${finalizedResultNumber}`],
      // Epic 5: the unified Decide "Standing" surface (live ranking, not a snapshot).
      ["decide", `/collections/${slug}/results`],
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
      ["set-aside", `/collections/${setAsideSlug}/results/set-aside`],
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
      // Wayfinding: the Items index (back arrow + Build/Sort/Decide chips) and an
      // item detail (deepest common trail: Collections / {name} / Items / {item};
      // the itemsOnly seed's single item is number 1).
      ["items", `/collections/${workspaceItemsFirstSlug}/items`],
      ["item-detail", `/collections/${workspaceItemsFirstSlug}/items/1`],
      // Epic 3: the pool "Photos" screen (grid + copy). poolOnly has loose photos.
      ["pool", `/collections/${workspacePoolFirstSlug}/pool`],
      // Epic R: the session hub showing all three round cards (Get acquainted /
      // Do you use this? / Which would you reach for first?) + the "recommended" card. The
      // untriaged journey seed leaves items usage-unknown + undisposed, so the
      // usage round renders.
      ["sort-hub", `/collections/${triageSlug}/sort/${triageSessionNumber}`],
      // Epic R: the usage round Relaxed surface (photo card, "Yes, I use it" /
      // "Not these days", "Skip for now", the answered cue, RoundLengthChooser + timer).
      ["usage-round", `/collections/${triageSlug}/sort/${triageSessionNumber}/usage`],
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

    const shot = (n: string) =>
      page.screenshot({ path: `pr-screenshots/${n}-${theme}-${proj}.png`, fullPage: true });

    // Epic R: usage-round scripted-tap surfaces. Like the /welcome beats below,
    // these are driven by role/accessible-name (never CSS), with the same img-wait
    // + settle. Placed before /welcome so its pre-existing flake can't block them.
    const usageUrl = `/collections/${triageSlug}/sort/${triageSessionNumber}/usage`;

    // Quick pace + its education line. Switching pace surfaces the reassurance copy
    // ("If you're not sure, it just comes around again.").
    await page.goto(usageUrl);
    await page.getByRole("img").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    await page.getByRole("button", { name: "Quick pace" }).click();
    await page
      .getByText("If you're not sure, it just comes around again.")
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(400);
    await shot("usage-round-quick");

    // Recap. Answer every queued item (3 in this seed; alternate "Yes, I use it" /
    // "Not these days") until the answer controls are gone — that exhausts the
    // queue and ends the round into the recap. Await the decisions flush (batch or
    // single) so the recap reflects real DB state, not just the optimistic view.
    await page.goto(usageUrl);
    await page.getByRole("img").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    const yes = page.getByRole("button", { name: "Yes, I use it" });
    const no = page.getByRole("button", { name: "Not these days" });
    const skip = page.getByRole("button", { name: /Skip for now/ });
    const decisionsPost = page.waitForResponse(
      (r) =>
        /\/api\/sessions\/[^/]+\/decisions(\/batch)?$/.test(r.url()) &&
        r.request().method() === "POST" &&
        r.status() < 400,
    );
    for (let i = 0; i < 6 && (await yes.isVisible().catch(() => false)); i++) {
      await (i % 2 === 0 ? yes : no).click();
      await page.waitForTimeout(300);
    }
    // Fallback: if a pass left an item queued, Skip terminates the round.
    for (let i = 0; i < 3 && (await skip.isVisible().catch(() => false)); i++) {
      await skip.click();
      await page.waitForTimeout(300);
    }
    await decisionsPost.catch(() => {});
    await page
      .getByText(/in your life|resting for now/)
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(400);
    await shot("usage-round-recap");

    // Epic S S3b: the DRAFT result's "Adjust results" mode — the flat
    // reorder list with the ≥44px drag handles + move-up/down controls + the
    // "Back to the computed order" reset. Driven by clicking the affordance
    // (role/accessible-name), then shot in both themes.
    await page.goto(`/collections/${slug}/results/${resultNumber}`);
    await page.getByRole("button", { name: "Adjust results" }).click();
    await page.getByTestId("rerank-row").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);
    await shot("results-rerank");

    // purses-ka23: the /welcome onboarding walkthrough. Unlike the goto+shoot
    // surfaces above, this is ONE client-only route with seven beats advanced by
    // taps — Purpose → Triage (×3) → Usage → Compare → Standing → Refine →
    // Hand-off. We drive it by role/accessible-name (never CSS) and shoot at each
    // beat. The three triage items reuse the same four tier buttons, so we tap
    // "Love" (the TierBadge's visible label; its glyph is aria-hidden) each time.
    await page.goto("/welcome");

    // Beat 1 — Purpose.
    await page.getByRole("heading", { name: "Rediscover what you love." }).waitFor();
    await page.waitForTimeout(400);
    await shot("welcome-1-purpose");

    // Beat 2 — Triage. Three items, one at a time; shoot the first, tap through.
    await page.getByRole("button", { name: "Show me how" }).click();
    await page.getByRole("heading", { name: "How do you feel about this one?" }).waitFor();
    await page.getByRole("img").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);
    await shot("welcome-2-triage");
    // Tap "Love" for all three triage items (advances item→item, then to Usage).
    await page.getByRole("button", { name: "Love" }).click();
    await page.getByRole("button", { name: "Love" }).click();
    await page.getByRole("button", { name: "Love" }).click();

    // Usage beat — "Do you use this?" A single tap advances; shoot before tapping.
    await page.getByRole("heading", { name: "Do you use this?" }).waitFor();
    await page.getByRole("img").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);
    await shot("welcome-usage");
    await page.getByRole("button", { name: "Yes, I use it" }).click();

    // Beat 4 — Compare.
    await page.getByRole("heading", { name: "Which would you reach for first?" }).waitFor();
    await page.getByRole("img").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);
    await shot("welcome-3-compare");

    // Beat 4 — Standing. Tap the left compare item ("The kid's microphone cushion").
    await page.getByRole("button", { name: "The kid's microphone cushion" }).click();
    // WelcomeStanding's h1 is "Your ranking so far"; "What you love most" is a <p> caption.
    await page.getByRole("heading", { name: "Your ranking so far" }).waitFor();
    await page.getByRole("img").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);
    await shot("welcome-4-standing");

    // Beat 6 — Refine. Standing's Continue advances to Refine (NOT straight to
    // Hand-off) since the #304 six-beat rebuild; the previous final step tapped
    // once and then waited for "Now, your turn.", which lands on Refine and hung.
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("heading", { name: "Refine it any time" }).waitFor();
    await page.waitForTimeout(400);
    await shot("welcome-refine");

    // Beat 7 — Hand-off. WelcomeHandoff's heading is "Now, your turn." (unchanged).
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("heading", { name: "Now, your turn." }).waitFor();
    await page.waitForTimeout(400);
    await shot("welcome-5-handoff");
  });
}
