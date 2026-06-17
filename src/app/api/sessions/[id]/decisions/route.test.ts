import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockGetDb, insertReturning, sessionRepo, collectionRepo, membershipRepo, prefRecalc } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(),
  insertReturning: vi.fn(),
  sessionRepo: { findById: vi.fn() },
  collectionRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
  prefRecalc: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(() => sessionRepo) }));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(() => collectionRepo) }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(() => membershipRepo) }));
vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({ CollectionPreferenceItemRepository: vi.fn(() => ({})) }));
vi.mock("@/server/repositories/implementations/DecisionEventRepository", () => ({ DecisionEventRepository: vi.fn(() => ({})) }));
vi.mock("@/server/services/ScoringService", () => ({ ScoringService: vi.fn(() => ({})) }));
vi.mock("@/server/services/PreferenceStateService", () => ({ PreferenceStateService: vi.fn(() => ({ recalculatePreferences: prefRecalc })) }));

import { POST } from "./route";

const req = (body: any) => ({ json: async () => body }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  // db.insert(...).values(...).returning() chain
  insertReturning.mockResolvedValue([{ id: "event1" }]);
  mockGetDb.mockReturnValue({ insert: () => ({ values: () => ({ returning: insertReturning }) }) });
  // Default: the requester (u1) IS the session's curator.
  sessionRepo.findById.mockResolvedValue({ id: "s1", collectionId: "c1", curatorId: "u1" });
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
  membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
});

describe("POST decisions", () => {
  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await POST(req({ type: "triage", decision: {} }), { params: { id: "s1" } })).status).toBe(401);
  });
  it("404 when the session does not exist — and does NOT write", async () => {
    sessionRepo.findById.mockResolvedValue(null);
    const res = await POST(req({ type: "triage", decision: {} }), { params: { id: "s1" } });
    expect(res.status).toBe(404);
    expect(insertReturning).not.toHaveBeenCalled();
  });
  it("403 when the session's collection isn't accessible — and does NOT write", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    const res = await POST(req({ type: "triage", decision: {} }), { params: { id: "s1" } });
    expect(res.status).toBe(403);
    expect(insertReturning).not.toHaveBeenCalled();
  });
  it("201 and writes when the requester IS the session's curator", async () => {
    const res = await POST(req({ type: "triage", decision: {} }), { params: { id: "s1" } });
    expect(res.status).toBe(201);
    expect(insertReturning).toHaveBeenCalled();
  });
  it("403 when a member who is NOT the session's curator tries to decide — and does NOT write (purses-t9l)", async () => {
    // Member has collection access, but the session belongs to another curator.
    sessionRepo.findById.mockResolvedValue({ id: "s1", collectionId: "c1", curatorId: "u9" });
    const res = await POST(req({ type: "triage", decision: {} }), { params: { id: "s1" } });
    expect(res.status).toBe(403);
    expect(insertReturning).not.toHaveBeenCalled();
  });
});
