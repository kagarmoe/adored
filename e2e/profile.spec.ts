import { test, expect } from "@playwright/test";

// Display-name flow (purses-wew): editing the name on /profile and saving must
// reflect in the header WITHOUT a page reload. The form PATCHes /api/users/me
// then calls better-auth's useSession().refetch() to re-pull the session; the
// Header reads session.user.name, so the banner text changes live.
//
// Authenticated via the shared storageState (the baseline user) — this is NOT a
// login-UI spec, so it must not drive /login (e2e-auth-testing). Runs on all
// three viewport projects from playwright.config.ts.
//
// Cross-spec safety: this mutates the baseline user's display name (shared DB
// state). That is safe because every other spec keys off the user's EMAIL or
// the session API, never the display name — the only references to the seeded
// name live in seed.ts. We also assert on a freshly-generated UNIQUE name so
// this spec can never collide with another spec's text expectations, and we
// never assert the name is still the seeded "E2E Tester" (which a prior run of
// this spec would have changed).

test("saving a new display name reflects in the header without a reload", async ({
  page,
}) => {
  // A distinctive, collision-proof name. Including a uuid suffix guarantees the
  // banner getByText match can only be satisfied by THIS spec's save, never by
  // residual state from another spec or a prior run.
  const uniqueName = `Adored E2E ${crypto.randomUUID()}`;

  await page.goto("/profile");

  // The form is a client component; wait for the labelled field to be ready so
  // we don't fill before hydration attaches the controlled onChange handler.
  // Epic 1 renamed this label "Display name" → "Name".
  const nameField = page.getByLabel("Name", { exact: true });
  await expect(nameField).toBeVisible();

  await nameField.fill(uniqueName);

  // Save and wait for the real PATCH to land before asserting — the header only
  // updates after the API succeeds and refetch() re-pulls the session.
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("/api/users/me") &&
        r.request().method() === "PATCH" &&
        r.ok(),
    ),
    page.getByRole("button", { name: "Save changes" }).click(),
  ]);

  // The substantive invariant: the header (banner landmark) shows the new name,
  // live, with NO navigation/reload. getByRole("banner") is the <header>
  // element; the profile link inside it renders session.user.name.
  await expect(
    page.getByRole("banner").getByText(uniqueName, { exact: true }),
  ).toBeVisible({ timeout: 15_000 });

  // Guard against a false positive where a reload happened: the URL is still
  // /profile and the in-page success status rendered (proves the SPA update
  // path, not a server round-trip that re-fetched the session).
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("status")).toHaveText(/Saved/);
});

test("profile links to tutorials and the completed sort tutorial", async ({ page }) => {
  await page.goto("/profile");

  await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tutorials" })).toBeVisible();

  await page.getByRole("link", { name: "Sort and refine" }).click();
  await expect(page).toHaveURL(/\/tutorials\/sort$/);
  await expect(
    page.getByRole("heading", { name: "Rediscover what you love." }),
  ).toBeVisible();
});
