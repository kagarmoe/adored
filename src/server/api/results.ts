import { z } from "zod";
import type { SortResult } from "@/types";
import type { ISortResultRepository } from "@/server/repositories/SortResultRepository";
import { FinalizeStateError } from "@/server/services/SortResultService";

const UpdateResultSchema = z.object({
  name: z.string().min(1).optional(),
});

export type UpdateResultInput = z.infer<typeof UpdateResultSchema>;

export class ResultController {
  constructor(private resultRepo: ISortResultRepository) {}

  async listResults(collectionId: string): Promise<SortResult[]> {
    return this.resultRepo.findByCollection(collectionId);
  }

  async getResult(resultId: string): Promise<SortResult> {
    const result = await this.resultRepo.findById(resultId);
    if (!result) {
      throw new Error("Result not found");
    }
    return result;
  }

  async updateResult(resultId: string, data: unknown): Promise<SortResult> {
    const parsed = UpdateResultSchema.parse(data);
    return this.resultRepo.update(resultId, parsed);
  }

  async finalizeResult(resultId: string): Promise<SortResult> {
    const result = await this.resultRepo.findById(resultId);
    if (!result) {
      throw new Error("Result not found");
    }
    if (result.status === "finalized") {
      throw new FinalizeStateError();
    }
    return this.resultRepo.update(resultId, {
      status: "finalized",
      finalizedAt: new Date(),
    });
  }
}
