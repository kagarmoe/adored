import { z } from "zod";
import type { SortResultShare } from "@/types";
import type { ISortResultShareRepository } from "@/server/repositories/SortResultShareRepository";
import { randomBytes } from "crypto";
import type { Database } from "@/lib/db";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";

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

  static fromDb(db: Database): ShareController {
    return new ShareController(new SortResultShareRepository(db));
  }

  async getByIdForResult(shareId: string, resultId: string): Promise<SortResultShare | null> {
    const share = await this.shareRepo.findById(shareId);
    return share && share.sortResultId === resultId ? share : null;
  }

  // Raw token lookup (no validation) — the shared-results page applies its own
  // status/expiry/finalized gating. viewSharedResult is the validating variant.
  async findByToken(token: string): Promise<SortResultShare | null> {
    return this.shareRepo.findByToken(token);
  }

  async listShares(resultId: string): Promise<SortResultShare[]> {
    return this.shareRepo.findByResult(resultId);
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
    const share = await this.shareRepo.findByToken(token);
    if (!share || share.status !== "active") {
      throw new Error("Share not found");
    }
    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new Error("Share expired");
    }
    return share;
  }
}
