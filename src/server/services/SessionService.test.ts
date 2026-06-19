import { describe, expect, it, vi } from "vitest";
import { SessionService } from "./SessionService";
import type { Session } from "@/types";
import type { ISessionRepository } from "@/server/repositories/SessionRepository";

const COLLECTION = "col-1";
const CURATOR = "cur-1";
const SESSION_ID = "sess-1";

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: SESSION_ID,
    collectionId: COLLECTION,
    curatorId: CURATOR,
    number: 1,
    status: "active",
    goal: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe("SessionService.createSession", () => {
  it("creates a session when no active one exists", async () => {
    const created = session({ goal: "declutter" });
    const create = vi.fn(async () => created);
    const repo = {
      findActive: async () => null,
      create,
    } as unknown as ISessionRepository;

    const result = await new SessionService(repo).createSession(
      COLLECTION,
      CURATOR,
      "declutter",
    );

    expect(create).toHaveBeenCalledWith({
      collectionId: COLLECTION,
      curatorId: CURATOR,
      goal: "declutter",
    });
    expect(result).toBe(created);
  });

  it("throws when an active session already exists for the curator", async () => {
    const create = vi.fn();
    const repo = {
      findActive: async () => session(),
      create,
    } as unknown as ISessionRepository;

    await expect(
      new SessionService(repo).createSession(COLLECTION, CURATOR),
    ).rejects.toThrow(/active session already exists/i);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("SessionService status transitions", () => {
  it("pause/resume/complete/abandon set the right status", async () => {
    const cases: Array<{
      method: "pauseSession" | "resumeSession" | "completeSession" | "abandonSession";
      status: Session["status"];
    }> = [
      { method: "pauseSession", status: "paused" },
      { method: "resumeSession", status: "active" },
      { method: "completeSession", status: "completed" },
      { method: "abandonSession", status: "abandoned" },
    ];

    for (const { method, status } of cases) {
      const update = vi.fn(async () => session({ status }));
      const repo = { update } as unknown as ISessionRepository;

      const result = await new SessionService(repo)[method](SESSION_ID);

      expect(update).toHaveBeenCalledWith(
        SESSION_ID,
        expect.objectContaining({ status }),
      );
      expect(result.status).toBe(status);
    }
  });
});

describe("SessionService read-through accessors", () => {
  it("getActiveSession / getCollectionSessions / getSession pass through", async () => {
    const active = session();
    const byId = session({ id: "sess-2" });
    const list = [session(), session({ id: "sess-3" })];

    const repo = {
      findActive: async () => active,
      findByCollection: async () => list,
      findById: async () => byId,
    } as unknown as ISessionRepository;

    const service = new SessionService(repo);

    expect(await service.getActiveSession(COLLECTION, CURATOR)).toBe(active);
    expect(await service.getCollectionSessions(COLLECTION)).toBe(list);
    expect(await service.getSession("sess-2")).toBe(byId);
  });
});
