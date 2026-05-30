import { z } from "zod";
import type { SortResultShare } from "@/types";
import type { ISortResultShareRepository } from "@/server/repositories/SortResultShareRepository";
import { randomBytes } from "crypto";

const CreateShareSchema = z.object({
  expiresAt: z.string().datetime().optional(),
});

const UpdateShareSchema = z.object({
  status: z.enum(["active", "revoked"]).optional(),
  expiresAt: z.string().datetime().optional(),
});

export type CreateShareInput = z.infer<typeof CreateShareSchema>;
export type UpdateShareInput = z.infer<typeof UpdateShareSchema>;

export class ShareController {
  constructor(private shareRepo: ISortResultShareRepository) {}

  async listShares(resultId: string): Promise<SortResultShare[]> {
    // TODO: Implement when ShareRepository.findByResult available
    return [];
  }

  async createShare(resultId: string, data: unknown): Promise<SortResultShare & { shareToken: string }> {
    const parsed = CreateShareSchema.parse(data);
    const token = randomBytes(32).toString("hex");
    const share = await this.shareRepo.create({
      sortResultId: resultId,
      shareToken: token,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
    });
    return { ...share, shareToken: token };
  }

  async getShare(shareId: string): Promise<SortResultShare> {
    const share = await this.shareRepo.findById(shareId);
    if (!share) {
      throw new Error("Share not found");
    }
    return share;
  }

  async updateShare(shareId: string, data: unknown): Promise<SortResultShare> {
    const parsed = UpdateShareSchema.parse(data);
    const updateData: Partial<SortResultShare> = {
      status: parsed.status,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
    };
    return this.shareRepo.update(shareId, updateData);
  }

  async revokeShare(shareId: string): Promise<void> {
    const share = await this.shareRepo.findById(shareId);
    if (!share) {
      throw new Error("Share not found");
    }
    await this.shareRepo.update(shareId, { status: "revoked" });
  }

  async viewSharedResult(token: string): Promise<SortResultShare> {
    // TODO: Find share by token and validate expiration
    throw new Error("Not implemented");
  }
}
