// The one item surface (spec 2026-10-01 §3), un-mocked except photo bytes (no blob emulator).
// Replaces item-page, delete-photo, image-rotate and delete-item. The upload pipeline itself
// (Blob callback → pool → reassign) is unit-tested in PoolUpload.test.tsx; here we prove the
// tile reaches a multi-file chooser.
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { seedBaseline, seedTriageScenario } from "./fixtures/seed";
import { getTestDb } from "./fixtures/db";
import { itemsTable } from "@/lib/db/schema";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";

// A reload proves the server kept the change — so only reload once the write has landed.
const landed = (page: Page, method: string, path: RegExp) =>
  page.waitForResponse((r) => r.request().method() === method && path.test(new URL(r.url()).pathname) && r.ok());

test.describe("item panel journey", () => {
  let slug: string;
  let secondPhotoId: string;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    const scenario = await seedTriageScenario(ownerId); // 1 unnamed item (#1) + 1 hero photo
    slug = scenario.slug;
    const { db } = getTestDb();
    const [item] = await db.select().from(itemsTable).where(eq(itemsTable.collectionId, scenario.collectionId));
    const second = await new PhotoRepository(db).create({
      itemId: item.id, collectionId: scenario.collectionId, blobKey: "e2e-second", filename: "e2e-second.jpg",
      mimeType: "image/jpeg", fileSize: 1, uploadedBy: ownerId, isHero: false,
    });
    secondPhotoId = second.id;
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/photo-files/**", (route) =>
      route.fulfill({ path: "e2e/fixtures/sample-images/labeled/item-panel.webp", contentType: "image/webp" }),
    );
  });

  test("view, rotate, cover, delete a photo, edit, choose, archive, bring back", async ({ page }) => {
    test.setTimeout(90_000);
    const panel = `/collections/${slug}/items/1`;
    await page.goto(panel);
    await expect(page).toHaveURL((u) => u.pathname === panel);

    // Flip through the carousel, then open the viewer and rotate (real PATCH).
    const stage = page.getByRole("group", { name: /photos of/i });
    const photo = stage.getByRole("img");
    const firstSrc = await photo.getAttribute("src");
    await page.getByRole("button", { name: /next photo/i }).click();
    await expect(photo).not.toHaveAttribute("src", firstSrc ?? "");
    await page.getByRole("button", { name: /view photo/i }).click();
    const dialog = page.getByRole("dialog");
    const before = await dialog.getByRole("img").getAttribute("src");
    const rotated = landed(page, "PATCH", /\/photos\/[^/]+$/);
    await dialog.getByRole("button", { name: /rotate photo/i }).click();
    expect((await rotated).request().postDataJSON()).toEqual({ rotation: 90 });
    await expect(dialog.getByRole("status")).toHaveText(/rotated to 90 degrees/i);
    // Persisted: the PATCH returned a new updatedAt, so the image URL's v= changed.
    await expect(dialog.getByRole("img")).not.toHaveAttribute("src", before ?? "");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // Make the second photo the cover; the server reorders it to the front.
    await page.getByRole("button", { name: "More for photo 2" }).click();
    const cover = landed(page, "POST", /\/photos\/[^/]+\/set-hero$/);
    await page.getByRole("menuitem", { name: "Make cover" }).click();
    await cover;
    await page.reload();
    await expect(page.getByRole("button", { name: "Show photo 1 (cover)" })).toBeVisible();
    await expect(photo).toHaveAttribute("src", new RegExp(secondPhotoId));

    // Delete the old cover (now photo 2): confirm first, then a real DELETE.
    await page.getByRole("button", { name: "More for photo 2" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByText(/can.t be undone/i)).toBeVisible();
    const removed = landed(page, "DELETE", /\/items\/[^/]+\/photos\/[^/]+$/);
    await page.getByRole("button", { name: "Delete photo", exact: true }).click();
    await removed;
    await page.reload();
    await expect(page.getByRole("button", { name: /^show photo/i })).toHaveCount(1);

    // + Add photos reaches a multi-file chooser (no upload: no blob emulator).
    await page.getByRole("button", { name: "Add photos" }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Select photos" }).click();
    expect((await chooser).isMultiple()).toBe(true);

    // One quiet Save persists text and size.
    await page.getByLabel("Name", { exact: true }).fill("Weekend tote");
    await page.getByLabel("Brand").fill("Coach");
    await page.getByText("Size", { exact: true }).click();
    await page.getByLabel("cm · kg").check();
    await page.getByLabel("Height (cm)").fill("30");
    const saved = landed(page, "PATCH", /\/items\/[^/]+$/);
    await page.getByRole("button", { name: "Save" }).click();
    await saved;
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Weekend tote");
    await expect(page.getByLabel("Brand")).toHaveValue("Coach");
    await expect(page.getByLabel("cm · kg")).toBeChecked();
    await expect(page.getByLabel("Height (cm)")).toHaveValue("30");

    // A name can't be blanked: it reverts on blur and says why.
    await page.getByLabel("Name", { exact: true }).fill("");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Weekend tote");
    await expect(page.getByText("Give it a name to save")).toBeVisible();

    // "In your life" chip persists through a real usage decision.
    const chose = landed(page, "POST", /\/decisions$/);
    await page.getByRole("button", { name: "I use this" }).click();
    await chose;
    await expect(page.getByRole("button", { name: "I use this" })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByRole("button", { name: "I use this" })).toHaveAttribute("aria-pressed", "true");

    // Archive (soft delete, no confirm) → gone from the list → Archived → Bring back.
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await page.waitForURL((u) => u.pathname === `/collections/${slug}/items` && u.searchParams.has("removed"));
    await expect(page.getByText(/^Archived\./)).toBeVisible();
    await expect(page.getByRole("link", { name: /Weekend tote/ })).toHaveCount(0);
    await page.getByRole("link", { name: "Archived", exact: true }).click();
    await page.getByRole("button", { name: "Bring back" }).click();
    await expect(page.getByRole("button", { name: "Bring back" })).toHaveCount(0);
    await page.getByRole("link", { name: "All", exact: true }).click();
    await expect(page.getByRole("link", { name: /Weekend tote/ })).toBeVisible();
  });
});
