import { z } from "zod";
import type { SortResult } from "@/types";
import type { Database } from "@/lib/db";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";

const UpdateResultSchema = z.object({
  name: z.string().min(1).optional(),
});

export class ResultController {
  constructor(private resultRepo: SortResultRepository) {}

  static fromDb(db: Database): ResultController {
    return new ResultController(new SortResultRepository(db));
  }

  async getResult(resultId: string): Promise<SortResult> {
    const result = await this.resultRepo.findById(resultId);
    if (!result) {
      throw new Error("Result not found");
    }
    return result;
  }

  // Returns null for an absent result so the caller maps it to notFound/404
  // without masking a real DB error (mirrors ItemController.getItem).
  async getResultOrNull(resultId: string): Promise<SortResult | null> {
    return this.resultRepo.findById(resultId);
  }

  async getByCollectionAndNumber(collectionId: string, number: number): Promise<SortResult | null> {
    return this.resultRepo.findByCollectionAndNumber(collectionId, number);
  }

  async updateResult(resultId: string, data: unknown): Promise<SortResult> {
    const parsed = UpdateResultSchema.parse(data);
    return this.resultRepo.update(resultId, parsed);
  }
}
