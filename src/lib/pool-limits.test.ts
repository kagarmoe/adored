import { describe, expect, it } from "vitest";
import { MAX_GROUP_PHOTOS, POOL_CAP_MESSAGE } from "./pool-limits";
import { MAX_GROUP_PHOTOS as SERVICE_MAX_GROUP_PHOTOS } from "@/server/services/ItemService";

describe("pool-limits", () => {
  it("is the single source of truth ItemService re-exports (one source, never duplicated)", () => {
    expect(SERVICE_MAX_GROUP_PHOTOS).toBe(MAX_GROUP_PHOTOS);
  });

  it("the cap sentence names the same number as the cap", () => {
    expect(POOL_CAP_MESSAGE).toContain(String(MAX_GROUP_PHOTOS));
  });
});
