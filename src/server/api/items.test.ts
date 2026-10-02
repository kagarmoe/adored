import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { ItemController } from "./items";
import type { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
function setup() {
  const update = vi.fn(async (_id: string, data: object) => data);
  return { update, ctl: new ItemController({ update } as unknown as ItemRepository) };
}
describe("ItemController.updateItem", () => {
  it("persists size, weight and unit as numeric strings and leaves unsent fields alone", async () => {
    const { update, ctl } = setup();
    await ctl.updateItem("i1", { height: 30, width: 12.5, depth: 0, weight: 1.2, unit: "metric" });
    const written = update.mock.calls[0][1] as Record<string, unknown>;
    expect(written).toMatchObject({ height: "30", width: "12.5", depth: "0", weight: "1.2", unit: "metric" });
    expect(written.name).toBeUndefined();
  });
  it("clears with null and treats a blank string as a clear", async () => {
    const { update, ctl } = setup();
    await ctl.updateItem("i1", { brand: null, notes: "   ", story: "", height: null });
    expect(update.mock.calls[0][1]).toMatchObject({ brand: null, notes: null, story: null, height: null });
  });
  it.each([
    ["an unknown key", { brand: "x", deletedAt: null }],
    ["a negative measure", { height: -1 }],
    ["an infinite measure (1e400 parses to Infinity)", JSON.parse('{"height":1e400}')],
    ["a numeric string measure", { weight: "12" }],
    ["an out-of-set unit", { unit: "furlongs" }],
    ["a null unit (column is NOT NULL)", { unit: null }],
    ["a whitespace-only name", { name: "   " }],
  ])("rejects %s and writes nothing", async (_label, body) => {
    const { update, ctl } = setup();
    await expect(ctl.updateItem("i1", body)).rejects.toBeInstanceOf(ZodError);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("ItemController.createItem", () => {
  it("caps text the way an update does (name/text 200, notes 5000)", async () => {
    const create = vi.fn();
    const ctl = new ItemController({ create } as unknown as ItemRepository);
    await expect(ctl.createItem("c1", { name: "x".repeat(201) })).rejects.toBeInstanceOf(ZodError);
    await expect(ctl.createItem("c1", { name: "Tote", brand: "x".repeat(201) })).rejects.toBeInstanceOf(ZodError);
    await expect(ctl.createItem("c1", { name: "Tote", notes: "x".repeat(5001) })).rejects.toBeInstanceOf(ZodError);
    expect(create).not.toHaveBeenCalled();
  });
});
