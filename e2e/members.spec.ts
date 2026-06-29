import { test, expect } from "@playwright/test";
import { closeDb } from "./fixtures/db";
import { seedBaseline, seedMembersScenario } from "./fixtures/seed";

// Behavioral e2e for the members + invitations surface (purses-nvj). Runs
// authenticated as the baseline owner via the shared storageState — never drives
// /login. Asserts the REAL rendered DOM: the RoleBadge label text the page emits
// ("Owner"/"Curator"), the email-only InviteForm, the Remove gating, and the
// invite success that InviteForm announces via role="status".
//
// Seeding: the members page reads only the `memberships` table; a collection's
// `ownerId` alone yields ZERO membership rows, so the page would render an empty
// table with no badge. seedMembersScenario() therefore inserts an OWNER row (the
// baseline user) + a CURATOR row (a fresh 2nd user). Uniquely-ided per run, so we
// do NOT resetDb() (that would wipe the baseline user every spec depends on).
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

  // RoleBadge label text — the reliable, accessible assertion (member.name is
  // never populated, so the name cells all read the "Member" fallback).
  await expect(page.getByText("Owner", { exact: true })).toBeVisible();
  await expect(page.getByText("Curator", { exact: true })).toBeVisible();

  // The email-only InviteForm: an email field + a submit button, nothing else.
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send invitation" }),
  ).toBeVisible();
});

test("Remove is gated to the non-owner row", async ({ page }) => {
  await page.goto(`/collections/${collectionId}/members`);
  await expect(page.getByText("Curator", { exact: true })).toBeVisible();

  // Exactly one Remove control: the curator row has one, the owner row does not
  // (MemberList renders Remove only when role !== "owner").
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(1);

  // And it lives on the curator's row, not the owner's.
  const curatorRow = page.getByRole("row").filter({ hasText: "Curator" });
  await expect(
    curatorRow.getByRole("button", { name: "Remove" }),
  ).toBeVisible();
  const ownerRow = page.getByRole("row").filter({ hasText: "Owner" });
  await expect(
    ownerRow.getByRole("button", { name: "Remove" }),
  ).toHaveCount(0);
});

test("submitting a valid email shows the announced success", async ({ page }) => {
  await page.goto(`/collections/${collectionId}/members`);

  // A unique address per run so the invite never collides with a prior row.
  const email = `invitee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@adored.test`;

  await page.getByLabel("Email address").fill(email);
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes(`/api/collections/${collectionId}/invitations`) &&
        r.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Send invitation" }).click(),
  ]);

  // The success view replaces the form and is announced to AT via role="status".
  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status).toHaveText(/Invitation sent successfully/);
});
