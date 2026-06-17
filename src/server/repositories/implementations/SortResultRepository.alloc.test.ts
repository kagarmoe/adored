import { describe, expect, it, vi, beforeEach } from "vitest";
import { SortResultRepository } from "./SortResultRepository";

const { selectWhere, insertReturning } = vi.hoisted(() => ({
  selectWhere: vi.fn(),
  insertReturning: vi.fn(),
}));

const valuesSpy = vi.fn(() => ({ returning: insertReturning }));

const db = {
  select: () => ({ from: () => ({ where: selectWhere }) }),
  insert: () => ({ values: valuesSpy }),
} as any;

const row = (number: number) => ({
  id: "res_1",
  collectionId: "c1",
  curatorId: "u1",
  number,
  status: "draft",
  name: "R",
  createdAt: new Date(),
  updatedAt: new Date(),
  finalizedAt: null,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SortResultRepository.create number allocation", () => {
  it("allocates MAX+1 on the happy path", async () => {
    selectWhere.mockResolvedValue([{ max: 2 }]);
    insertReturning.mockResolvedValue([row(3)]);
    const r = await new SortResultRepository(db).create({ collectionId: "c1", curatorId: "u1", name: "R", status: "draft" });
    expect(r.number).toBe(3);
    expect(valuesSpy).toHaveBeenCalledTimes(1);
    expect((valuesSpy.mock.calls as any[][])[0]![0].number).toBe(3);
    expect(insertReturning).toHaveBeenCalledTimes(1);
  });

  it("retries on the (collection,number) race AND recomputes the next number", async () => {
    selectWhere.mockResolvedValueOnce([{ max: 2 }]).mockResolvedValueOnce([{ max: 3 }]);
    insertReturning
      .mockRejectedValueOnce({ code: "23505", message: 'unique constraint "sort_results_collection_number_unique"' })
      .mockResolvedValueOnce([row(4)]);
    const r = await new SortResultRepository(db).create({ collectionId: "c1", curatorId: "u1", name: "R", status: "draft" });
    expect(r.number).toBe(4);
    expect((valuesSpy.mock.calls as any[][])[0]![0].number).toBe(3); // first attempt tried 3
    expect((valuesSpy.mock.calls as any[][])[1]![0].number).toBe(4); // retry recomputed to 4
    expect(selectWhere).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry an unrelated unique violation", async () => {
    selectWhere.mockResolvedValue([{ max: 2 }]);
    insertReturning.mockRejectedValueOnce({ code: "23505", message: "some other constraint" });
    await expect(
      new SortResultRepository(db).create({ collectionId: "c1", curatorId: "u1", name: "R", status: "draft" })
    ).rejects.toMatchObject({ code: "23505" });
    expect(valuesSpy).toHaveBeenCalledTimes(1);
  });
});
