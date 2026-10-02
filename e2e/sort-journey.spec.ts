// The one sort path (spec 2026-10-01 §4), un-mocked except photo bytes (no blob
// emulator): start → feelings for five pieces (Undo, Not yet twice, Not mine) →
// pairs (Undo) → end → ranking (Still deciding, Set aside + Bring back, a hand
// move that survives a reload) → save and share → the link opens signed out.
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { seedBaseline, seedJourneyScenario } from "./fixtures/seed";
import { getTestDb } from "./fixtures/db";
import { sessionsTable, sortResultsTable } from "@/lib/db/schema";

const FIXTURE = "e2e/fixtures/sample-images/labeled/sort-images.webp";

const landed = (page: Page, method: string, path: RegExp) =>
  page.waitForResponse((r) => r.request().method() === method && path.test(new URL(r.url()).pathname) && r.ok());

test.describe("sort journey", () => {
  let slug: string;
  let collectionId: string;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug, collectionId } = await seedJourneyScenario(ownerId, 5));
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/photo-files/**", (route) => route.fulfill({ path: FIXTURE, contentType: "image/webp" }));
  });

  test("start, feelings, pairs, ranking, save and share, open the link", async ({ page, browser }) => {
    test.setTimeout(120_000);
    const home = `/collections/${slug}`;
    await page.goto(home);
    await expect(page).toHaveURL((u) => u.pathname === home);
    await page.getByRole("button", { name: "Keep sorting" }).click();
    await page.waitForURL((u) => u.pathname === `${home}/sort`);

    // ── Feelings ─────────────────────────────────────────────────────────────
    const piece = page.locator("main h3").first();
    const names: string[] = [];
    const answer = async (control: string | RegExp) => {
      await expect(page.getByRole("heading", { name: "How do you feel about this one?" })).toBeVisible();
      names.push(await piece.innerText());
      const name = typeof control === "string" ? { name: control, exact: true } : { name: control };
      await page.getByRole("button", name).click();
    };
    await answer("Love");
    await page.getByRole("button", { name: "Undo: Love" }).click();
    await expect(piece).toHaveText(names.pop() as string);
    await answer("Love"); // names[0]
    await answer("Like"); // names[1]
    await answer(/^Not yet/); // names[2] waits
    await answer(/^Not mine/); // names[3] set aside
    await answer("Love"); // names[4]
    // The waiting piece returns at the end of the phase; a second Not yet lets it rest.
    await expect(page.getByText("Ready when you are.", { exact: true })).toBeVisible();
    await expect(piece).toHaveText(names[2]);
    await page.getByRole("button", { name: /^Not yet/ }).click();

    // ── Pairs (Love + Like: names[0], names[1], names[4]) ─────────────────────
    await page.waitForURL((u) => u.searchParams.get("phase") === "pairs");
    await expect(page.getByText("Now, between these two…")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Which would you reach for first?" })).toBeVisible();
    const choose = page.getByRole("button", { name: /^Choose / });
    const done = page.getByRole("heading", { name: "That’s everything for now" });
    const pairKey = () => choose.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).join("|"));
    const answerPair = async () => {
      const before = await pairKey();
      await choose.first().click();
      await expect.poll(async () => (await done.isVisible()) || (await pairKey()) !== before).toBe(true);
    };

    const firstChoice = ((await choose.first().getAttribute("aria-label")) ?? "").replace(/^Choose /, "");
    await answerPair();
    // Three pieces always make more than one pair, so Undo is always on offer here.
    await expect(done).toBeHidden();
    await page.getByRole("button", { name: `Undo: ${firstChoice}` }).click();
    await expect(page.getByRole("button", { name: `Choose ${firstChoice}` })).toHaveAttribute("aria-pressed", "true");
    await answerPair();
    for (let i = 0; i < 6 && !(await done.isVisible()); i++) await answerPair();
    await expect(done).toBeVisible();

    // ── Ranking ──────────────────────────────────────────────────────────────
    await page.getByRole("link", { name: "See your ranking", exact: true }).click();
    await page.waitForURL((u) => u.pathname === `${home}/results`);
    await expect(page.getByText("What you love most")).toBeVisible();
    const rows = page.getByRole("region", { name: "Your order" }).getByRole("listitem");
    await expect(rows).toHaveCount(3);
    await expect(page.getByRole("region", { name: "Still deciding" })).toContainText(names[2]);

    await page.getByText("Set aside", { exact: true }).click(); // open the <details>
    const broughtBack = landed(page, "DELETE", /\/dispositions\/[^/]+$/);
    await page.getByRole("button", { name: /bring back/i }).click();
    await broughtBack;
    await expect(page.getByText("Set aside", { exact: true })).toHaveCount(0);

    const second = await rows.nth(1).getByRole("link").innerText();
    const moved = landed(page, "PUT", /\/ranking\/pins\/[^/]+$/);
    await page.getByRole("button", { name: `Move ${second} up` }).click();
    await moved;
    await page.reload();
    await expect(rows.first().getByRole("link")).toHaveText(second);
    await expect(page.getByRole("button", { name: `Unpin ${second}` })).toBeVisible();

    // ── Save and share ───────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Save and share" }).click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(/^E2E Journey Bags, /);
    await page.getByLabel("Name", { exact: true }).fill("My journey keepers");
    const saved = landed(page, "POST", /\/ranking\/save$/);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await saved;
    const link = await page.getByLabel("Link to share").inputValue();
    expect(link).toMatch(/\/shared-results\/[0-9a-f]{64}$/);

    const { db } = getTestDb();
    const results = await db.select().from(sortResultsTable).where(eq(sortResultsTable.collectionId, collectionId));
    expect(results.map((r) => r.status)).toEqual(["finalized"]);
    const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.collectionId, collectionId));
    expect(sessions.map((s) => s.status)).toEqual(["completed"]);

    // A stranger with the link reaches the read-only ranking (purses-a45s), and its
    // photos come from the token-scoped route, never the session-gated one.
    const stranger = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anon = await stranger.newPage();
    await anon.route("**/api/shared-results/*/photos/**", (route) => route.fulfill({ path: FIXTURE, contentType: "image/webp" }));
    const path = new URL(link).pathname;
    const photo = anon.waitForResponse((r) => /\/api\/shared-results\/[^/]+\/photos\//.test(new URL(r.url()).pathname));
    await anon.goto(path);
    await expect(anon).toHaveURL((u) => u.pathname === path);
    await expect(anon.getByRole("heading", { name: "My journey keepers" })).toBeVisible();
    expect((await photo).status()).toBe(200);
    await stranger.close();
  });
});
