import { z } from "zod";
import type { SortResultItem } from "@/types";
import type { ISortResultItemRepository } from "@/server/repositories/SortResultRepository";
import type { Database } from "@/lib/db";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";

const UpdateResultItemSchema = z.object({
  manualRank: z.number().optional(),
  manualBucket: z.enum(["top", "high", "medium", "low"]).optional(),
});

export type UpdateResultItemInput = z.infer<typeof UpdateResultItemSchema>;

export class ResultItemController {
  constructor(private resultItemRepo: ISortResultItemRepository) {}

  static fromDb(db: Database): ResultItemController {
    return new ResultItemController(new SortResultItemRepository(db));
  }

  async getByIdForResult(resultItemId: string, resultId: string): Promise<SortResultItem | null> {
    const item = await this.resultItemRepo.findById(resultItemId);
    return item && item.sortResultId === resultId ? item : null;
  }

  async listResultItems(resultId: string): Promise<SortResultItem[]> {
    return this.resultItemRepo.findByResult(resultId);
  }

  async getResultItem(resultItemId: string): Promise<SortResultItem> {
    const item = await this.resultItemRepo.findById(resultItemId);
    if (!item) {
      throw new Error("Result item not found");
    }
    return item;
  }

  async updateResultItem(resultItemId: string, data: unknown): Promise<SortResultItem> {
    const parsed = UpdateResultItemSchema.parse(data);
    return this.resultItemRepo.update(resultItemId, parsed);
  }

  async resetResultItem(resultItemId: string): Promise<SortResultItem> {
    // Clear manual overrides, revert to computed rank/bucket
    return this.resultItemRepo.update(resultItemId, {
      manualRank: null,
      manualBucket: null,
    });
  }
}
