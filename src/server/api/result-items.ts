import type { SortResultItem } from "@/types";
import type { Database } from "@/lib/db";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";

export class ResultItemController {
  constructor(private resultItemRepo: SortResultItemRepository) {}

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
}
