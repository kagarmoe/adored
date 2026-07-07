import { describe, expect, it, beforeEach } from "vitest";
import type { Item } from "@/types";
import type { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { ItemController } from "./items";

// In-memory repo capturing the exact args the controller forwards — the same
// boundary-only style as invitations.test.ts. Lets us assert BOTH the schema
// validation (rejects) and the createItem field-map plumbing (dimensions reach
// the repo; unit omitted when absent) without a DB.
function makeRepo() {
  const calls = {
    create: [] as any[],
    update: [] as { id: string; data: any }[],
  };
  const repo = {
    async create(data: any): Promise<Item> {
      calls.create.push(data);
      return { id: "itm_1", number: 1, ...data } as Item;
    },
    async update(id: string, data: any): Promise<Item> {
      calls.update.push({ id, data });
      return { id, ...data } as Item;
    },
  } as unknown as ItemRepository;
  return { repo, calls };
}

let controller: ItemController;
let calls: ReturnType<typeof makeRepo>["calls"];

beforeEach(() => {
  const made = makeRepo();
  controller = new ItemController(made.repo);
  calls = made.calls;
});

describe("createItem — dimension schema (accepts)", () => {
  it("forwards decimal height/width/depth/weight + unit to the repo", async () => {
    await controller.createItem("col_1", {
      name: "Measured Bag",
      height: "9",
      width: "11.5",
      depth: "4",
      weight: "1.2",
      unit: "metric",
    });

    expect(calls.create).toHaveLength(1);
    const data = calls.create[0];
    expect(data.height).toBe("9");
    expect(data.width).toBe("11.5");
    expect(data.depth).toBe("4");
    expect(data.weight).toBe("1.2");
    expect(data.unit).toBe("metric");
  });

  it("omits unit when absent so the DB default applies", async () => {
    await controller.createItem("col_1", { name: "Plain Bag" });

    expect(calls.create).toHaveLength(1);
    expect(calls.create[0].unit).toBeUndefined();
    // Omitted dimensions arrive as undefined (the repo maps them to null).
    expect(calls.create[0].height).toBeUndefined();
    expect(calls.create[0].width).toBeUndefined();
  });

  it("treats an empty-string dimension as omitted, not as a value", async () => {
    await controller.createItem("col_1", {
      name: "Half-measured Bag",
      height: "9",
      width: "",
      depth: "",
      weight: "",
    });

    const data = calls.create[0];
    expect(data.height).toBe("9");
    expect(data.width).toBeUndefined();
    expect(data.depth).toBeUndefined();
    expect(data.weight).toBeUndefined();
  });
});

describe("createItem — dimension schema (rejects, nothing persisted)", () => {
  it.each([
    ["negative", "-5"],
    ["zero", "0"],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
    ["non-numeric", "abc"],
    ["above the 10000 cap", "10001"],
    ["a partly-numeric string", "11.5in"],
  ])("rejects a %s height without calling the repo", async (_label, height) => {
    await expect(
      controller.createItem("col_1", { name: "Bad Bag", height }),
    ).rejects.toThrow();
    expect(calls.create).toHaveLength(0);
  });

  it("accepts the boundary value 10000", async () => {
    await controller.createItem("col_1", { name: "Big Bag", width: "10000" });
    expect(calls.create[0].width).toBe("10000");
  });

  // Postgres numeric rejects these, but `Number()` coerces them — so the boundary
  // must reject the plain-decimal violators before they reach an insert.
  it.each([
    ["hex", "0x10"],
    ["octal", "0o17"],
    ["binary", "0b101"],
    ["scientific notation", "1e5"],
    ["trailing whitespace", "12 "],
    ["leading whitespace", " 12"],
    ["embedded whitespace", "1 2"],
  ])("rejects a %s dimension (%s) without calling the repo", async (_label, height) => {
    await expect(
      controller.createItem("col_1", { name: "Coerced Bag", height }),
    ).rejects.toThrow();
    expect(calls.create).toHaveLength(0);
  });

  it("rejects an unknown unit", async () => {
    await expect(
      controller.createItem("col_1", {
        name: "Bad Unit Bag",
        height: "9",
        unit: "furlongs",
      }),
    ).rejects.toThrow();
    expect(calls.create).toHaveLength(0);
  });
});

describe("updateItem — dimension schema", () => {
  it("passes valid dimensions + unit through to the repo update", async () => {
    await controller.updateItem("itm_1", {
      width: "11.5",
      weight: "1.2",
      unit: "imperial",
    });

    expect(calls.update).toHaveLength(1);
    const { data } = calls.update[0];
    expect(data.width).toBe("11.5");
    expect(data.weight).toBe("1.2");
    expect(data.unit).toBe("imperial");
  });

  it("rejects a negative dimension on update", async () => {
    await expect(
      controller.updateItem("itm_1", { height: "-3" }),
    ).rejects.toThrow();
    expect(calls.update).toHaveLength(0);
  });

  it("clears a dimension: an empty string becomes an explicit null so the column is nulled", async () => {
    // On UPDATE, "" must reach the repo as null (an explicit write), not undefined
    // (which Drizzle drops, keeping the old value). This is the blank-out fix.
    await controller.updateItem("itm_1", { height: "", width: "" });

    expect(calls.update).toHaveLength(1);
    const { data } = calls.update[0];
    expect(data.height).toBeNull();
    expect(data.width).toBeNull();
  });

  it("leaves an absent dimension undefined on update so the column is untouched", async () => {
    // An omitted key must stay undefined — Drizzle drops it, preserving the value.
    await controller.updateItem("itm_1", { color: "Red" });

    const { data } = calls.update[0];
    expect(data.height).toBeUndefined();
    expect(data.width).toBeUndefined();
    expect("height" in data ? data.height : undefined).toBeUndefined();
  });

  it.each([
    ["hex", "0x10"],
    ["scientific notation", "1e5"],
    ["trailing whitespace", "12 "],
  ])("rejects a %s dimension (%s) on update", async (_label, width) => {
    await expect(
      controller.updateItem("itm_1", { width }),
    ).rejects.toThrow();
    expect(calls.update).toHaveLength(0);
  });
});
