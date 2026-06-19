// src/app/api/sort-results/route.test.ts
//
// Tests for POST /api/sort-results: auth / validation / access cases plus the
// materialization case — the route wires to SortResultService.createDraftResult,
// which materializes a SortResultItem per preference. The un-mocked authoritative
// proof of materialization lives in src/lib/db/*.integration.test.ts (real DB).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const {
  mockGetSession,
  mockGetDb,
  mockRequireApiCollectionAccess,
  sortResultRepo,
  sortResultItemRepo,
  preferenceRepo,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(),
  mockRequireApiCollectionAccess: vi.fn(),
  sortResultRepo: { create: vi.fn() },
  sortResultItemRepo: { create: vi.fn() },
  preferenceRepo: { findByCollection: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/dal/collection-access", () => ({
  requireApiCollectionAccess: mockRequireApiCollectionAccess,
}));
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({
  SortResultRepository: vi.fn(() => sortResultRepo),
}));
vi.mock("@/server/repositories/implementations/SortResultItemRepository", () => ({
  SortResultItemRepository: vi.fn(() => sortResultItemRepo),
}));
vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({
  CollectionPreferenceItemRepository: vi.fn(() => preferenceRepo),
}));

import { POST } from "./route";

const COLLECTION = { id: "c1", ownerId: "u1" } as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockGetDb.mockReturnValue({});
  // Default: access granted, returns the collection (not a NextResponse).
  mockRequireApiCollectionAccess.mockResolvedValue(COLLECTION);
  sortResultRepo.create.mockResolvedValue({
    id: "sr1",
    collectionId: "c1",
    curatorId: "u1",
    name: "My Sort",
    status: "draft",
  });
  sortResultItemRepo.create.mockResolvedValue({ id: "sri1" });
  // One preference so createDraftResult materializes ≥1 SortResultItem.
  preferenceRepo.findByCollection.mockResolvedValue([
    { itemId: "i1", score: 0.875, rankBucket: "top" },
  ]);
});

const postReq = (body: any) => ({ json: async () => body }) as any;

describe("POST /api/sort-results", () => {
  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(postReq({ collectionId: "c1", name: "My Sort" }));
    expect(res.status).toBe(401);
    expect(sortResultRepo.create).not.toHaveBeenCalled();
  });

  it("400 when collectionId is missing", async () => {
    const res = await POST(postReq({ name: "My Sort" }));
    expect(res.status).toBe(400);
    expect(sortResultRepo.create).not.toHaveBeenCalled();
  });

  it("400 when name is missing", async () => {
    const res = await POST(postReq({ collectionId: "c1" }));
    expect(res.status).toBe(400);
    expect(sortResultRepo.create).not.toHaveBeenCalled();
  });

  it("403 when collection access is denied", async () => {
    mockRequireApiCollectionAccess.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(postReq({ collectionId: "c1", name: "My Sort" }));
    expect(res.status).toBe(403);
    expect(sortResultRepo.create).not.toHaveBeenCalled();
  });

  it("201 forces curatorId from session and status draft", async () => {
    // A spoofed curatorId / status in the body must be ignored: the route owns
    // both — curator is the session user, a freshly created result is a draft.
    const res = await POST(
      postReq({
        collectionId: "c1",
        name: "My Sort",
        curatorId: "attacker",
        status: "finalized",
      }),
    );
    expect(res.status).toBe(201);
    expect(sortResultRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionId: "c1",
        curatorId: "u1",
        name: "My Sort",
        status: "draft",
      }),
    );
  });

  // Intended behavior: the route delegates to SortResultService.createDraftResult,
  // which reads the curator's preferences and materializes one SortResultItem per
  // preference. With one seeded preference, the item-repo create path is invoked.
  it(
    "POST /sort-results materializes one SortResultItem per preference",
    async () => {
      const res = await POST(postReq({ collectionId: "c1", name: "My Sort" }));
      expect(res.status).toBe(201);
      expect(sortResultItemRepo.create).toHaveBeenCalled();
    },
  );
});
