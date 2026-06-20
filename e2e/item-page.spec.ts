// e2e/item-page.spec.ts — the redesigned item page: flip-through carousel + details card.
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { seedBaseline, seedTriageScenario } from "./fixtures/seed";
import { getTestDb } from "./fixtures/db";
import { itemsTable } from "@/lib/db/schema";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";

test.describe("item page — carousel + details", () => {
  let slug: string;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    const scenario = await seedTriageScenario(ownerId); // 1 item (#1) + 1 hero photo
    slug = scenario.slug;
    // Add a second photo so the carousel has something to flip to.
    const { db } = getTestDb();
    const items = await db.select().from(itemsTable).where(eq(itemsTable.collectionId, scenario.collectionId));
    await new PhotoRepository(db).create({
      itemId: items[0].id,
      collectionId: scenario.collectionId,
      blobKey: "e2e-second",
      filename: "e2e-second.jpg",
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: ownerId,
      isHero: false,
    });
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: "e2e/fixtures/photos/cc0-01.jpg", contentType: "image/jpeg" }),
    );
  });

  test("flips to the next photo and shows the details card", async ({ page }) => {
    await page.goto(`/collections/${slug}/items/1`);
    const carousel = page.getByRole("group", { name: /photos of/i });
    await expect(carousel).toBeVisible();

    const img = carousel.getByRole("img");
    const before = await img.getAttribute("src");
    await page.getByRole("button", { name: /next photo/i }).click();
    await expect(img).not.toHaveAttribute("src", before ?? ""); // a different photo is shown

    await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  });

  test("the view control opens the zoom/rotate viewer", async ({ page }) => {
    await page.goto(`/collections/${slug}/items/1`);
    await page.getByRole("button", { name: /view photo/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
