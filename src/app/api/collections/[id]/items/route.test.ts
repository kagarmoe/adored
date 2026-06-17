// src/app/api/collections/[id]/items/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockGetDb, collectionRepo, membershipRepo, ctrl } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(() => ({})),
  collectionRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
  ctrl: { listItems: vi.fn(), createItem: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(() => collectionRepo) }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(() => membershipRepo) }));
vi.mock("@/server/api/items", () => ({ ItemController: vi.fn(() => ctrl) }));

import { GET, POST } from "./route";

const req = (body?: any) => ({ json: async () => body }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
  membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
  ctrl.listItems.mockResolvedValue([]);
  ctrl.createItem.mockResolvedValue({ id: "item1" });
});

describe("/api/collections/[id]/items", () => {
  it("GET 403 when not member or owner", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    expect((await GET(req(), { params: { id: "c1" } })).status).toBe(403);
  });
  it("GET 200 for a member", async () => {
    expect((await GET(req(), { params: { id: "c1" } })).status).toBe(200);
  });
  it("POST 403 when not member or owner — and does NOT create", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    const res = await POST(req({ name: "x" }), { params: { id: "c1" } });
    expect(res.status).toBe(403);
    expect(ctrl.createItem).not.toHaveBeenCalled();
  });
  it("POST 201 for the owner without a membership row", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u1" });
    expect((await POST(req({ name: "x" }), { params: { id: "c1" } })).status).toBe(201);
  });
});
