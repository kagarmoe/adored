import { describe, expect, it, vi, beforeEach } from "vitest";
import { SessionRepository } from "./SessionRepository";

const { selectWhere, insertReturning } = vi.hoisted(() => ({
  selectWhere: vi.fn(),
  insertReturning: vi.fn(),
}));

const valuesSpy = vi.fn(() => ({ returning: insertReturning }));

// Minimal drizzle chain stub: select(...).from(...).where() and insert(...).values(...).returning().
const db = {
  select: () => ({ from: () => ({ where: selectWhere }) }),
  insert: () => ({ values: valuesSpy }),
} as any;

const row = (number: number) => ({
  id: "sess_1",
  collectionId: "c1",
  curatorId: "u1",
  number,
  status: "active",
  goal: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SessionRepository.create number allocation", () => {
  it("allocates MAX+1 on the happy path", async () => {
    selectWhere.mockResolvedValue([{ max: 5 }]); // getNextSessionNumber -> 6
    insertReturning.mockResolvedValue([row(6)]);
    const s = await new SessionRepository(db).create({ collectionId: "c1", curatorId: "u1" });
    expect(s.number).toBe(6);
    expect(insertReturning).toHaveBeenCalledTimes(1);
  });

  it("retries on the (collection,number) race AND recomputes the next number", async () => {
    selectWhere.mockResolvedValueOnce([{ max: 5 }]).mockResolvedValueOnce([{ max: 6 }]);
    insertReturning
      .mockRejectedValueOnce({ code: "23505", message: 'unique constraint "sessions_collection_number_unique"' })
      .mockResolvedValueOnce([row(7)]);
    const s = await new SessionRepository(db).create({ collectionId: "c1", curatorId: "u1" });
    expect(s.number).toBe(7);
    expect((valuesSpy.mock.calls as any[][])[0]![0].number).toBe(6); // first attempt tried 6
    expect((valuesSpy.mock.calls as any[][])[1]![0].number).toBe(7); // retry recomputed to 7
  });

  it("does NOT retry the one-session-per-curator constraint — it surfaces", async () => {
    selectWhere.mockResolvedValue([{ max: 5 }]);
    insertReturning.mockRejectedValueOnce({ code: "23505", message: 'duplicate key value violates unique constraint "sessions_active_unique"' });
    await expect(new SessionRepository(db).create({ collectionId: "c1", curatorId: "u1" })).rejects.toMatchObject({ code: "23505" });
    expect(valuesSpy.mock.calls.length).toBe(1);
  });
});
