import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@vercel/blob", () => ({ list: vi.fn(), del: vi.fn() }));
import { list, del } from "@vercel/blob";
import { variantPath, variantPrefix, deleteVariants } from "./photo-variants";

const mockList = list as unknown as ReturnType<typeof vi.fn>;
const mockDel = del as unknown as ReturnType<typeof vi.fn>;

describe("variant key helpers", () => {
  it("builds a deterministic variant pathname (collection/photo/width-version.webp)", () => {
    expect(variantPath("c1", "p1", 640, 1700000000000)).toBe(
      "variants/c1/p1/w640-v1700000000000.webp",
    );
  });

  it("builds per-photo and per-collection prefixes", () => {
    expect(variantPrefix("c1", "p1")).toBe("variants/c1/p1/");
    expect(variantPrefix("c1")).toBe("variants/c1/");
  });
});

describe("deleteVariants", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockDel.mockReset();
  });

  it("lists the prefix and deletes every variant url (paginating)", async () => {
    mockList
      .mockResolvedValueOnce({ blobs: [{ url: "u1" }, { url: "u2" }], hasMore: true, cursor: "C" })
      .mockResolvedValueOnce({ blobs: [{ url: "u3" }], hasMore: false, cursor: undefined });
    mockDel.mockResolvedValue(undefined);

    await deleteVariants("variants/c1/");

    expect(mockList).toHaveBeenNthCalledWith(1, { prefix: "variants/c1/", cursor: undefined });
    expect(mockList).toHaveBeenNthCalledWith(2, { prefix: "variants/c1/", cursor: "C" });
    expect(mockDel).toHaveBeenCalledWith(["u1", "u2"]);
    expect(mockDel).toHaveBeenCalledWith(["u3"]);
  });

  it("is a no-op when there are no variants", async () => {
    mockList.mockResolvedValue({ blobs: [], hasMore: false });
    await deleteVariants("variants/c1/p1/");
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("swallows errors (best-effort, never throws)", async () => {
    mockList.mockRejectedValue(new Error("blob outage"));
    await expect(deleteVariants("variants/c1/")).resolves.toBeUndefined();
  });
});
