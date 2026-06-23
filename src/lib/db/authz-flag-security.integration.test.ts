// Tests for T1: client-supplied flags/role are stripped; repo.update is allow-listed
//
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

// Route handlers — imported AFTER mocks.
import { POST as invitationsPost } from "@/app/api/collections/[id]/invitations/route";
import { POST as membersPost } from "@/app/api/collections/[id]/members/route";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function makeNextRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describeDb("T1 — client-supplied flags/role stripped (authz flag security)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("createInvitation ignores unknown body keys — only email is accepted (flags dropped in purses-us3d)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const collectionId = await seedBareCollection(ownerId);

    // Seed membership so requireApiCollectionAccess passes
    const { db } = getTestDb();
    await new MembershipRepository(db).create({
      collectionId,
      userId: ownerId,
      role: "owner",
    });

    const res = await invitationsPost(
      makeNextRequest("POST", `http://localhost/api/collections/${collectionId}/invitations`, {
        email: "t1@test.com",
        canManageCollection: true, // unknown field — stripped by schema
      }),
      { params: { id: collectionId } },
    );
    expect(res.status).toBe(201);

    // The invitation was created; flag columns no longer exist on the type.
    const body = await res.json();
    const inv = await new InvitationRepository(db).findById(body.id);
    expect(inv).not.toBeNull();
    expect(inv!.email).toBe("t1@test.com");
    expect(inv!.status).toBe("pending");
  });

  it("addMember ignores body role and flags — created membership is always role:curator", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const collectionId = await seedBareCollection(ownerId);
    const strangerId = await seedUserRow("stranger-member");

    // Seed owner membership so requireApiCollectionAccess passes
    const { db } = getTestDb();
    await new MembershipRepository(db).create({
      collectionId,
      userId: ownerId,
      role: "owner",
    });

    const res = await membersPost(
      makeNextRequest("POST", `http://localhost/api/collections/${collectionId}/members`, {
        userId: strangerId,
        canManageCollection: true,
        role: "owner",
      }),
      { params: { id: collectionId } },
    );
    expect(res.status).toBe(201);

    // Membership must be role:curator regardless of what was in the body
    const mem = await new MembershipRepository(db).findByUser(strangerId, collectionId);
    expect(mem).not.toBeNull();
    expect(mem!.role).toBe("curator");
  });

  it("MembershipRepository.update ignores role and collectionId — only updatedAt changes", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);

    // Create a membership directly
    const mem = await new MembershipRepository(db).create({
      collectionId,
      userId: ownerId,
      role: "curator",
    });

    // Attempt to escalate via update (role + collectionId are immutable; flags are gone)
    await new MembershipRepository(db).update(mem.id, {
      role: "owner" as any,
      collectionId: "other-col-id",
    });

    // Re-fetch and assert nothing sensitive changed
    const updated = await new MembershipRepository(db).findById(mem.id);
    expect(updated).not.toBeNull();
    expect(updated!.role).toBe("curator");
    expect(updated!.collectionId).toBe(collectionId);
  });
});
