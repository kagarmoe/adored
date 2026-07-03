import { test, expect } from "@playwright/test";
import { closeDb } from "./fixtures/db";
import { seedBaseline, seedMembersScenario } from "./fixtures/seed";

// Behavioral e2e for the members + invitations surface (purses-nvj; Members
// handoff refresh, Epic 1 Task B). Runs authenticated as the baseline owner via
// the shared storageState — never drives /login. Asserts the REAL rendered DOM:
// the RoleBadge label text the page emits ("Owner"/"Curator"), the email-only
// InviteForm ("Invite by email" / "Send invite"), the Remove gating on the
// surface-raised member cards, and the invite success InviteForm announces via
// role="status".
//
// Seeding: the members page reads the `memberships` table (joined to `user` for
// name/email); a collection's `ownerId` alone yields ZERO membership rows, so the
// page would render no cards. seedMembersScenario() therefore inserts an OWNER row
// (the baseline user) + a CURATOR row (a fresh 2nd user). Uniquely-ided per run,
// so we do NOT resetDb() (that would wipe the baseline user every spec depends on).
//
// Isolation: the only mutation this spec performs is creating an invitation row
// (a unique random email, in a freshly-seeded collection). It adds no member and
// touches no other spec's data, so it cannot interfere with the rest of the suite.

let collectionId: string;

test.beforeAll(async () => {
  const ownerId = await seedBaseline();
  ({ collectionId } = await seedMembersScenario(ownerId));
});

test.afterAll(async () => {
  await closeDb();
});

test("owner sees both RoleBadges and the email-only InviteForm", async ({ page }) => {
  await page.goto(`/collections/${collectionId}/members`);

  // The owner-only page resolved (a non-owner/redirect would land on /collections
  // or /login). The members table renders both seeded roles.
  await expect(page).toHaveURL(new RegExp(`/collections/${collectionId}/members`));

  // RoleBadge label text — the reliable, accessible assertion. Names now come
  // from the user join (seedMembersScenario labels the curator "members-curator").
  await expect(page.getByText("Owner", { exact: true })).toBeVisible();
  await expect(page.getByText("Curator", { exact: true })).toBeVisible();

  // The email-only InviteForm: an email field + a submit button, nothing else.
  await expect(page.getByLabel("Invite by email")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send invite" }),
  ).toBeVisible();
});

test("Remove is gated to the non-owner row", async ({ page }) => {
  await page.goto(`/collections/${collectionId}/members`);
  await expect(page.getByText("Curator", { exact: true })).toBeVisible();

  // Exactly one Remove control: the curator card has one, the owner card does not
  // (MemberList renders Remove only when role !== "owner").
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(1);

  // And it lives on the curator's card, not the owner's. Member rows are
  // surface-raised card <div>s now (not table rows); match on the card element.
  const curatorCard = page.locator("div.bg-surface-raised").filter({ hasText: "Curator" });
  await expect(
    curatorCard.getByRole("button", { name: "Remove" }),
  ).toBeVisible();
  const ownerCard = page.locator("div.bg-surface-raised").filter({ hasText: "Owner" });
  await expect(
    ownerCard.getByRole("button", { name: "Remove" }),
  ).toHaveCount(0);
});

test("submitting a valid email shows the announced success", async ({ page }) => {
  await page.goto(`/collections/${collectionId}/members`);

  // A unique address per run so the invite never collides with a prior row.
  const email = `invitee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@adored.test`;

  await page.getByLabel("Invite by email").fill(email);
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes(`/api/collections/${collectionId}/invitations`) &&
        r.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Send invite" }).click(),
  ]);

  // The success view replaces the form and is announced to AT via role="status".
  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status).toHaveText(/Invitation sent successfully/);
});
