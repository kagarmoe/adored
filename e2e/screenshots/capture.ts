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
  seedNamedCollection,
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
let finalizedResultNumber = 0;
let ownerId = "";
let waitingSlug = "";
let setAsideSlug = "";
let pausedSlug = "";
let pairsSlug = "";
let workspacePoolFirstSlug = "";
let workspaceItemsFirstSlug = "";
let archivedSlug = "";
// SHOTS=home,item-detail → capture only those surfaces (the full run outlasts
// a 10-minute tool ceiling). Unset = everything.
const only = process.env.SHOTS?.split(",");

test.beforeAll(async () => {
  ownerId = await seedBaseline();
  ({ slug, finalizedResultNumber } = await seedSortScenario(ownerId));
  // A collection with real owner + curator membership rows so the members shot
  // shows the RoleBadge (the baseline seed inserts collections without them).
  ({ slug: membersSlug } = await seedMembersScenario(ownerId));


  // The Not yet state. A 2-item journey where item A already has a feeling (a
  // preference row) and item B is deferred — so the ONLY piece left in feelings
  // is the waiting one and the "Ready when you are." banner renders.
  const waiting = await seedJourneyScenario(ownerId, 2);
  waitingSlug = waiting.slug;
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

  // A story on the waiting collection's item 1 so the item-detail shot shows the
  // panel's filled "Where will it go next?" field.
  await new ItemRepository(db).update(waiting.itemIds[0], {
    story:
      "To my niece, who always borrowed it for weekend trips — I hope it carries her somewhere good.",
  });

  // The Ranking's Set aside group. A 2-item journey where one item carries a
  // `set_aside` disposition — so the <details> lists one row (cover + name +
  // "Bring back"). Mirrors the Not yet seed.
  const setAside = await seedJourneyScenario(ownerId, 2);
  setAsideSlug = setAside.slug;
  await new ItemDispositionRepository(db).upsert({
    collectionId: setAside.collectionId,
    curatorId: ownerId,
    itemId: setAside.itemIds[0],
    disposition: "set_aside",
  });

  // A paused sort, shot on the collection page (its one Keep sorting action).
  // Not shot on /sort: ResumeOnLoad reactivates a paused session there.
  const paused = await seedJourneyScenario(ownerId, 2);
  pausedSlug = paused.slug;
  const pausedSession = await new SessionRepository(db).findActive(
    paused.collectionId,
    ownerId,
  );
  if (!pausedSession) throw new Error("capture: paused seed had no active session to pause");
  await new SessionRepository(db).update(pausedSession.id, { status: "paused" });

  // Collection home: the two shapes reviewers compare —
  // pool-first (loose pool photos drive the page) and items-first (no pool, items
  // only). Placeholder blobKeys ride the same /file intercept as every other shot.
  const workspace = await seedWorkspaceStates(ownerId);
  workspacePoolFirstSlug = workspace.poolOnly.slug;
  workspaceItemsFirstSlug = workspace.itemsOnly.slug;

  // UX redesign PR 1: the Archived pill lists soft-deleted items (Bring back, no link).
  const archived = await seedJourneyScenario(ownerId, 3);
  archivedSlug = archived.slug;
  await new ItemRepository(db).softDelete(archived.itemIds[0]);
  // UX redesign PR 3: one archived collection, so the collections-archived shot is not empty.
  await seedNamedCollection(ownerId, "E2E Archived shelf", "archived");

  // UX redesign PR 2: the pairs phase — two Love pieces, nothing compared yet.
  const pairsSeed = await seedJourneyScenario(ownerId, 2);
  pairsSlug = pairsSeed.slug;
  for (const itemId of pairsSeed.itemIds) {
    await new CollectionPreferenceItemRepository(db).create({
      collectionId: pairsSeed.collectionId, curatorId: ownerId, itemId,
      score: 0.875, confidence: 0.1, rankBucket: "top", comparisonCount: 1,
    });
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`capture ${theme}`, async ({ page }, testInfo) => {
    // Seeded PER TEST so each theme's feelings shot starts from an untouched queue.
    const { slug: triageSlug } = await seedJourneyScenario(ownerId, 3);

    // theme-script.tsx reads localStorage 'pi-theme' before paint — set it first.
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("pi-theme", t);
      } catch {
        /* storage blocked — falls back to light, fine */
      }
    }, theme);
    // Item photos load via /api/photo-files/<id>; unassigned pool photos via
    // /api/collections/<id>/pool/photos/<id>/file (src/lib/photos.ts).
    await page.route("**/pool/photos/**/file*", (route) =>
      route.fulfill({ path: FIXTURE, contentType: "image/webp" }),
    );
    await page.route("**/api/photo-files/**", (route) =>
      route.fulfill({ path: FIXTURE, contentType: "image/webp" }),
    );

    const proj = testInfo.project.name;
    const surfaces: [string, string][] = [
      ["collections", "/collections"],
      // UX redesign PR 3: the collections grid's Archived view, the home as the
      // items grid (items, pool-first, archived) — phone shots show the bottom bar.
      ["collections-archived", "/collections?status=archived"],
      ["home", `/collections/${slug}`],
      ["home-pool-first", `/collections/${workspacePoolFirstSlug}`],
      ["home-items-first", `/collections/${workspaceItemsFirstSlug}`],
      ["home-archived", `/collections/${archivedSlug}?status=archived`],
      ["item-detail", `/collections/${slug}/items/1`],
      // The item panel with its story field filled.
      ["item-detail-story", `/collections/${waitingSlug}/items/1`],
      // The live Ranking (most-loved hero, Your order with move/Unpin, Onward)
      // and a saved one (frozen snapshot).
      ["ranking", `/collections/${slug}/results`],
      ["saved-ranking", `/collections/${slug}/results/${finalizedResultNumber}`],
      // pv9 PR8 + PR1b (purses-c0w): members page renders MemberList (RoleBadge —
      // Owner/Curator on the existing Badge variants) + email-only InviteForm.
      // Points at the seedMembersScenario collection so real role rows render.
      ["members", `/collections/${membersSlug}/members`],
      // PR1a (purses-wew): editable display-name profile (no image — the img
      // wait below just times out harmlessly via .catch).
      ["profile", "/profile"],
      // The one Sort screen: feelings, a waiting (Not yet) piece, and pairs.
      ["sort-feelings", `/collections/${triageSlug}/sort`],
      ["sort-not-yet", `/collections/${waitingSlug}/sort`],
      ["sort-pairs", `/collections/${pairsSlug}/sort?phase=pairs`],
      // The Ranking's Set aside group (open the <details> by hand to see the row).
      ["ranking-set-aside", `/collections/${setAsideSlug}/results`],
      // A paused sort on the collection page: one Keep sorting action.
      ["collection-paused", `/collections/${pausedSlug}`],
      // Wayfinding: an item detail (deepest common trail: Collections / {name} / {item};
      // the itemsOnly seed's single item is number 1).
      ["item-detail", `/collections/${workspaceItemsFirstSlug}/items/1`],
      // Epic 3: the pool "Photos" screen (grid + copy). poolOnly has loose photos.
      ["pool", `/collections/${workspacePoolFirstSlug}/pool`],
    ].filter(([n]) => !only || only.includes(n)) as [string, string][];
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

    if (!only || only.includes("result-revision-note")) {
      // purses-w7ss.5: the revision note. A hand move on the Ranking pins a piece off
      // its saved slot, so "Make a revision" on the saved result asks first. Pin once
      // (the second theme pass finds the Unpin button and reuses it); end on "Keep my
      // ranking" so nothing is discarded.
      await page.goto(`/collections/${slug}/results`);
      if ((await page.getByRole("button", { name: /^Unpin / }).count()) === 0) {
        // Wait for the pin write itself: the Unpin button appears optimistically.
        const pinned = page.waitForResponse((r) => r.url().includes("/ranking/pins/") && r.ok());
        await page.getByRole("button", { name: /^Move .* down$/ }).first().click();
        await pinned;
        await page.waitForLoadState("networkidle"); // let the post-pin refresh settle
      }
      await page.goto(`/collections/${slug}/results/${finalizedResultNumber}`);
      await page.getByRole("button", { name: "Make a revision" }).click();
      await page.getByRole("group", { name: "Before you revise" }).waitFor({ state: "visible", timeout: 10_000 });
      await page.waitForTimeout(400);
      await shot("result-revision-note");
      await page.getByRole("button", { name: "Keep my ranking" }).click();
    }

    // UX redesign PR 5: the pool's selection bar (fixed at every width). Viewport-only shot:
    // a full-page capture paints a fixed bar at the fold (memory phone-fullpage-capture-fixed-bar-artifact).
    if (!only || only.includes("pool-selected")) {
      await page.goto(`/collections/${workspacePoolFirstSlug}/pool`);
      await page.getByRole("img").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
      await page.getByRole("button", { name: "pool 1", exact: true }).click();
      await page.getByRole("button", { name: "pool 2", exact: true }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `pr-screenshots/pool-selected-${theme}-${proj}.png` });
    }

    if (only && !only.includes("item-delete-confirm")) return;

    // purses-v7gv: the item ··· menu (owner sees Archive + Delete) and the
    // items-list undo notice. Self-restoring — the beat ends on "Undo", so the
    // collection is exactly as seeded for every later beat and the other theme pass.
    await page.goto(`/collections/${slug}/items/1`);
    await page.getByRole("img").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByText("Delete this item for good?").waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(400);
    await shot("item-delete-confirm");
    await page.getByRole("button", { name: "Keep" }).click();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await page.getByRole("button", { name: "Undo", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(400);
    await shot("items-removed-undo");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.getByRole("link", { name: /view/i }).first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);
    if (only) return;

    // purses-ka23: the /welcome onboarding walkthrough. Unlike the goto+shoot
    // surfaces above, this is ONE client-only route with five beats advanced by
    // taps — Purpose → Feelings (×3) → Pairs → Standing → Hand-off. Driven by
    // role/accessible-name (never CSS), shooting at each beat.
    await page.goto("/welcome");

    // Beat 1 — Purpose.
    await page.getByRole("heading", { name: "Rediscover what you love." }).waitFor();
    await page.waitForTimeout(400);
    await shot("welcome-1-purpose");

    // Beat 2 — Feelings. Three pieces, one at a time; shoot the first, tap through.
    await page.getByRole("button", { name: "Show me how" }).click();
    await page.getByRole("heading", { name: "How do you feel about this one?" }).waitFor();
    await page.getByRole("img").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);
    await shot("welcome-2-triage");
    // Feelings: Love, Like, Maybe — two loved pieces make exactly one pair.
    await page.getByRole("button", { name: "Love", exact: true }).click();
    await page.getByRole("button", { name: "Like", exact: true }).click();
    await page.getByRole("button", { name: "Maybe", exact: true }).click();

    // Pairs.
    await page.getByRole("heading", { name: "Which would you reach for first?" }).waitFor();
    await page.getByRole("img").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);
    await shot("welcome-3-compare");
    await page.getByRole("button", { name: "Tie", exact: true }).click();

    // Ranking.
    await page.getByRole("heading", { name: "Your ranking so far" }).waitFor();
    await page.getByRole("img").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);
    await shot("welcome-4-standing");

    // Hand-off.
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("heading", { name: "Now, your turn." }).waitFor();
    await page.waitForTimeout(400);
    await shot("welcome-5-handoff");
  });
}
