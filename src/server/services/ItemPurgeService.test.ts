// Regression (purses-6eb): item purge used to del ONLY the original blobs and
// never sweep the resized variants, so EVERY item purge permanently orphaned
// `variants/{collectionId}/{photoId}/*` — a deterministic leak, no failure
// required. The sibling paths (CollectionPurgeService, the photo DELETE route)
// already swept variants; this one forgot.
//
// Unit tier on purpose: the gap is "which blob calls does the service make",
// not a real-DB crossing. The repos/tx are stubbed; the assertion is on the
// blob-side effects.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "@/types/domain";
import type { Database } from "@/lib/db";
import type { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";

const { mockDel, mockDeleteVariants, mockHardDeleteByItem } = vi.hoisted(() => ({
  mockDel: vi.fn(),
  mockDeleteVariants: vi.fn(),
  mockHardDeleteByItem: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ del: mockDel }));
vi.mock("@/lib/photo-variants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/photo-variants")>()),
  deleteVariants: mockDeleteVariants,
}));
// Run the callback inline — no real transaction machinery in a unit test.
vi.mock("@/lib/transactions", () => ({
  withTransaction: (db: unknown, fn: (tx: unknown) => unknown) => fn(db),
}));
vi.mock("@/server/services/purge-lock", () => ({ lockCollectionCurators: vi.fn() }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({
  PhotoRepository: class {
    hardDeleteByItem = mockHardDeleteByItem;
  },
}));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({
  ItemRepository: class {
    hardDelete = vi.fn();
  },
}));
vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({
  CollectionPreferenceItemRepository: class {
    deleteByItem = vi.fn().mockResolvedValue(0);
  },
}));
vi.mock("@/server/repositories/implementations/ItemDispositionRepository", () => ({
  ItemDispositionRepository: class {
    deleteByItem = vi.fn();
  },
}));
vi.mock("@/server/repositories/implementations/AuditLogRepository", () => ({
  AuditLogRepository: class {
    record = vi.fn();
  },
}));

import { ItemPurgeService } from "./ItemPurgeService";

const item = { id: "item-1", collectionId: "coll-1" } as Item;

describe("ItemPurgeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHardDeleteByItem.mockResolvedValue([
      { id: "photo-a", blobKey: "https://blob.example/a.jpg" },
      { id: "photo-b", blobKey: "https://blob.example/b.jpg" },
    ]);
  });

  function service() {
    const sortResultItemRepo = { existsByItem: vi.fn().mockResolvedValue(false) };
    return new ItemPurgeService(
      {} as unknown as Database,
      sortResultItemRepo as unknown as SortResultItemRepository,
    );
  }

  it("deletes each photo's original blob AND sweeps its resized variants", async () => {
    await service().purge(item, "actor-1");

    expect(mockDel.mock.calls.flat()).toEqual([
      "https://blob.example/a.jpg",
      "https://blob.example/b.jpg",
    ]);
    expect(mockDeleteVariants.mock.calls.flat().sort()).toEqual([
      "variants/coll-1/photo-a/",
      "variants/coll-1/photo-b/",
    ]);
  });
});
