import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectRetired } = vi.hoisted(() => ({ redirectRetired: vi.fn() }));
vi.mock("@/lib/collections/retired-redirect", () => ({ redirectRetired }));

import ItemsListRedirect from "./page";

beforeEach(() => vi.clearAllMocks());

const go = async (sp?: Record<string, string | string[]>) => {
  await ItemsListRedirect({ params: Promise.resolve({ id: "bags" }), searchParams: sp && Promise.resolve(sp) });
  const [id, to, query] = redirectRetired.mock.lastCall as [string, string, URLSearchParams];
  return [id, to, query.toString()];
};

describe("retired items list → the collection home", () => {
  it("carries only the allow-listed view, query and an id-shaped notice", async () => {
    expect(await go()).toEqual(["bags", "", ""]);
    expect(await go({ status: "archived", q: "tote", removed: "itm_1", utm: "x" })).toEqual([
      "bags", "", "status=archived&q=tote&removed=itm_1",
    ]);
    expect(await go({ q: ["a", "b"], unnamed: "1", status: "nope" })).toEqual(["bags", "", "unnamed=1"]);
    expect(await go({ q: "y".repeat(150) })).toEqual(["bags", "", `q=${"y".repeat(100)}`]);
    expect(await go({ removed: "../collections/c/archive#", unnamed: ["1", "1"], q: "  " })).toEqual(["bags", "", ""]);
  });
});
