import { z } from "zod";
import type { SortResultItem } from "@/types";
import type { Database } from "@/lib/db";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultService } from "@/server/services/SortResultService";

const UpdateResultItemSchema = z.object({
  manualRank: z.number().optional(),
  manualBucket: z.enum(["top", "high", "medium", "low"]).optional(),
});

// Epic S S3a: the bulk re-rank batch — a full ordering of {rid, manualRank}.
// manualRank is a dense int (shared numeric space with computedRank), so the
// client sends the whole recomputed sequence for the moved block.
const ReorderResultItemsSchema = z.object({
  order: z.array(
    z.object({
      rid: z.string(),
      manualRank: z.number().int(),
    }),
  ),
});


export class ResultItemController {
  constructor(
    private resultItemRepo: SortResultItemRepository,
    private service: SortResultService,
  ) {}

  static fromDb(db: Database): ResultItemController {
    return new ResultItemController(
      new SortResultItemRepository(db),
      SortResultService.fromDb(db),
    );
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

  // Epic S S3a: validate the batch at the boundary (Zod), then delegate the
  // atomic write to the service. rid-membership is enforced INSIDE the service
  // transaction (a bad rid rolls the whole batch back → 404).
  async reorderResultItems(resultId: string, data: unknown): Promise<SortResultItem[]> {
    const { order } = ReorderResultItemsSchema.parse(data);
    return this.service.reorderResultItems(resultId, order);
  }

  // Epic S S3a: whole-list reset — NULL the manual overlay for every item.
  async resetResultItems(resultId: string): Promise<SortResultItem[]> {
    return this.service.resetManualOverridesForResult(resultId);
  }
}
