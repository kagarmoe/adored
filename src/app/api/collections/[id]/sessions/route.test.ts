// src/app/api/collections/[id]/sessions/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockGetDb, collectionRepo, membershipRepo, ctrl } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(() => ({})),
  collectionRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
  ctrl: { listSessions: vi.fn(), createSession: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(() => collectionRepo) }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(() => membershipRepo) }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(() => ({})) }));
vi.mock("@/server/api/sessions", () => ({ SessionController: vi.fn(() => ctrl) }));

import { GET, POST } from "./route";

const req = (body?: unknown) => ({ json: async () => body }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
  membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
  ctrl.listSessions.mockResolvedValue([]);
  ctrl.createSession.mockResolvedValue({ id: "s1" });
});

describe("GET /api/collections/[id]/sessions", () => {
  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await GET(req(), { params: { id: "c1" } })).status).toBe(401);
  });

  it("403 when not member or owner", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    expect((await GET(req(), { params: { id: "c1" } })).status).toBe(403);
  });

  it("200 for a member", async () => {
    expect((await GET(req(), { params: { id: "c1" } })).status).toBe(200);
  });

  it("200 for the owner without a membership row", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u1" });
    expect((await GET(req(), { params: { id: "c1" } })).status).toBe(200);
  });
});

describe("POST /api/collections/[id]/sessions", () => {
  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await POST(req({}), { params: { id: "c1" } })).status).toBe(401);
  });

  it("403 when not member or owner — and does NOT call createSession", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    const res = await POST(req({}), { params: { id: "c1" } });
    expect(res.status).toBe(403);
    expect(ctrl.createSession).not.toHaveBeenCalled();
  });

  it("201 for a member", async () => {
    expect((await POST(req({}), { params: { id: "c1" } })).status).toBe(201);
  });

  it("201 for the owner without a membership row", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u1" });
    expect((await POST(req({}), { params: { id: "c1" } })).status).toBe(201);
  });

  it("400 on invalid JSON", async () => {
    const badReq = { json: async () => { throw new SyntaxError("bad json"); } } as any;
    expect((await POST(badReq, { params: { id: "c1" } })).status).toBe(400);
  });
});
