import { describe, expect, it, vi } from "vitest";
import { SortResultShareService } from "./SortResultShareService";
import type { SortResult, SortResultItem, SortResultShare } from "@/types";
import type { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import type { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import type { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";

const RESULT_ID = "res-1";

function share(overrides: Partial<SortResultShare> = {}): SortResultShare {
  return {
    id: "share-1",
    sortResultId: RESULT_ID,
    shareToken: "abc",
    status: "active",
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function sortResult(overrides: Partial<SortResult> = {}): SortResult {
  return {
    id: RESULT_ID,
    collectionId: "col-1",
    curatorId: "cur-1",
    number: 1,
    status: "finalized",
    name: "Spring sort",
    createdAt: new Date(),
    updatedAt: new Date(),
    finalizedAt: new Date(),
    ...overrides,
  };
}

function sortResultItem(
  overrides: Partial<SortResultItem> = {},
): SortResultItem {
  return {
    id: `item-${overrides.itemId ?? "x"}`,
    sortResultId: RESULT_ID,
    itemId: "x",
    computedRank: 0,
    computedBucket: "medium",
    manualRank: null,
    manualBucket: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("SortResultShareService.createShare", () => {
  it("createShare without expiry stores a hex token and no expiresAt", async () => {
    const create = vi.fn(async () => share());
    const shareRepo = { create } as unknown as SortResultShareRepository;

    await new SortResultShareService(
      shareRepo,
      {} as unknown as SortResultRepository,
      {} as unknown as SortResultItemRepository,
    ).createShare(RESULT_ID);

    const arg = create.mock.calls[0][0];
    expect(arg.sortResultId).toBe(RESULT_ID);
    expect(arg.shareToken).toMatch(/^[0-9a-f]{32}$/);
    expect(arg.expiresAt).toBeUndefined();
  });

  it("createShare with expiryDays sets expiresAt in the future", async () => {
    const create = vi.fn(async () => share());
    const shareRepo = { create } as unknown as SortResultShareRepository;

    await new SortResultShareService(
      shareRepo,
      {} as unknown as SortResultRepository,
      {} as unknown as SortResultItemRepository,
    ).createShare(RESULT_ID, 7);

    const arg = create.mock.calls[0][0];
    expect(arg.shareToken).toMatch(/^[0-9a-f]{32}$/);
    expect(arg.expiresAt).toBeInstanceOf(Date);
    expect(arg.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("SortResultShareService.viewSharedResult", () => {
  it("viewSharedResult returns null for an unknown token", async () => {
    const shareRepo = {
      findByToken: async () => null,
    } as unknown as SortResultShareRepository;

    const view = await new SortResultShareService(
      shareRepo,
      {} as unknown as SortResultRepository,
      {} as unknown as SortResultItemRepository,
    ).viewSharedResult("nope");

    expect(view).toBeNull();
  });

  it("viewSharedResult returns null for a revoked token", async () => {
    const shareRepo = {
      findByToken: async () => share({ status: "revoked" }),
    } as unknown as SortResultShareRepository;

    const view = await new SortResultShareService(
      shareRepo,
      {} as unknown as SortResultRepository,
      {} as unknown as SortResultItemRepository,
    ).viewSharedResult("revoked-token");

    expect(view).toBeNull();
  });

  it("viewSharedResult returns null for an expired token", async () => {
    const shareRepo = {
      findByToken: async () =>
        share({ expiresAt: new Date(Date.now() - 1000) }),
    } as unknown as SortResultShareRepository;

    const view = await new SortResultShareService(
      shareRepo,
      {} as unknown as SortResultRepository,
      {} as unknown as SortResultItemRepository,
    ).viewSharedResult("expired-token");

    expect(view).toBeNull();
  });

  it("viewSharedResult maps items to the public shape", async () => {
    const shareRepo = {
      findByToken: async () => share(),
    } as unknown as SortResultShareRepository;
    const resultRepo = {
      findById: async () => sortResult({ name: "Spring sort" }),
    } as unknown as SortResultRepository;
    const itemRepo = {
      findByResult: async () => [
        sortResultItem({
          itemId: "a",
          computedRank: 0,
          computedBucket: "top",
          manualRank: 2,
          manualBucket: "high",
        }),
      ],
    } as unknown as SortResultItemRepository;

    const view = await new SortResultShareService(
      shareRepo,
      resultRepo,
      itemRepo,
    ).viewSharedResult("good-token");

    expect(view).toEqual({
      resultName: "Spring sort",
      items: [
        {
          itemId: "a",
          computedRank: 0,
          computedBucket: "top",
          manualRank: 2,
          manualBucket: "high",
        },
      ],
    });
  });
});

describe("SortResultShareService.isShareValid", () => {
  it("isShareValid false for revoked/expired, true otherwise", async () => {
    const validRepo = {
      findByToken: async () => share(),
    } as unknown as SortResultShareRepository;
    const revokedRepo = {
      findByToken: async () => share({ status: "revoked" }),
    } as unknown as SortResultShareRepository;
    const expiredRepo = {
      findByToken: async () =>
        share({ expiresAt: new Date(Date.now() - 1000) }),
    } as unknown as SortResultShareRepository;

    const noResult = {} as unknown as SortResultRepository;
    const noItem = {} as unknown as SortResultItemRepository;

    expect(
      await new SortResultShareService(validRepo, noResult, noItem).isShareValid(
        "good",
      ),
    ).toBe(true);
    expect(
      await new SortResultShareService(
        revokedRepo,
        noResult,
        noItem,
      ).isShareValid("revoked"),
    ).toBe(false);
    expect(
      await new SortResultShareService(
        expiredRepo,
        noResult,
        noItem,
      ).isShareValid("expired"),
    ).toBe(false);
  });
});
