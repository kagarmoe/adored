import { z } from "zod";
import type { SortResult } from "@/types";
import type { ISortResultRepository } from "@/server/repositories/SortResultRepository";

const CreateResultSchema = z.object({
  name: z.string().min(1),
});

const UpdateResultSchema = z.object({
  name: z.string().min(1).optional(),
});

export type CreateResultInput = z.infer<typeof CreateResultSchema>;
export type UpdateResultInput = z.infer<typeof UpdateResultSchema>;

export class ResultController {
  constructor(private resultRepo: ISortResultRepository) {}

  async listResults(collectionId: string): Promise<SortResult[]> {
    // TODO: Implement when ResultRepository.findByCollection available
    return [];
  }

  async createDraftResult(
    sessionId: string,
    collectionId: string,
    curatorId: string,
    data: unknown,
  ): Promise<SortResult> {
    const parsed = CreateResultSchema.parse(data);
    // Create draft result from preferences
    // TODO: Integrate with PreferenceStateService to compute preferences first
    // TODO: Create SortResultItems from computed preferences
    return this.resultRepo.create({
      collectionId,
      curatorId,
      name: parsed.name,
      status: "draft",
    });
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
    // TODO: Mark result as finalized (immutable)
    const result = await this.resultRepo.findById(resultId);
    if (!result) {
      throw new Error("Result not found");
    }
    return this.resultRepo.update(resultId, {
      status: "finalized",
      finalizedAt: new Date(),
    });
  }

  async deleteResult(resultId: string): Promise<void> {
    const result = await this.resultRepo.findById(resultId);
    if (!result) {
      throw new Error("Result not found");
    }
    if (result.status !== "draft") {
      throw new Error("Cannot delete finalized result");
    }
    // TODO: Implement hard delete for draft result
  }

  async supersedeResult(resultId: string): Promise<SortResult> {
    const result = await this.resultRepo.findById(resultId);
    if (!result) {
      throw new Error("Result not found");
    }
    if (result.status !== "finalized") {
      throw new Error("Can only supersede finalized results");
    }
    // Create new draft from finalized result
    // TODO: Copy all SortResultItems to new result (without manual overrides)
    // TODO: Create new draft with same curator/collection
    throw new Error("Supersede not yet implemented - requires SortResultItems copy logic");
  }
}
