import { randomBytes } from "crypto";
import type { SortResultShare } from "@/types";
import type { ISortResultShareRepository } from "@/server/repositories/SortResultShareRepository";
import type { ISortResultRepository, ISortResultItemRepository } from "@/server/repositories/SortResultRepository";

export interface SharedResultView {
  resultName: string;
  items: Array<{
    itemId: string;
    computedRank: number;
    computedBucket: "top" | "high" | "medium" | "low";
    manualRank: number | null;
    manualBucket: "top" | "high" | "medium" | "low" | null;
  }>;
}

export class SortResultShareService {
  constructor(
    private shareRepo: ISortResultShareRepository,
    private resultRepo: ISortResultRepository,
    private resultItemRepo: ISortResultItemRepository,
  ) {}

  private generateShareToken(): string {
    return randomBytes(16).toString("hex");
  }

  async createShare(
    sortResultId: string,
    expiryDays?: number,
  ): Promise<SortResultShare> {
    const token = this.generateShareToken();
    const expiresAt = expiryDays
      ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
      : undefined;

    return this.shareRepo.create({
      sortResultId,
      shareToken: token,
      expiresAt,
    });
  }

  async viewSharedResult(token: string): Promise<SharedResultView | null> {
    const share = await this.shareRepo.findByToken(token);
    if (!share) return null;

    if (share.status === "revoked") return null;

    if (share.expiresAt && new Date() > share.expiresAt) {
      return null;
    }

    const result = await this.resultRepo.findById(share.sortResultId);
    if (!result) return null;

    const items = await this.resultItemRepo.findByResult(share.sortResultId);

    return {
      resultName: result.name,
      items: items.map((item) => ({
        itemId: item.itemId,
        computedRank: item.computedRank,
        computedBucket: item.computedBucket,
        manualRank: item.manualRank,
        manualBucket: item.manualBucket,
      })),
    };
  }

  async revokeShare(id: string): Promise<SortResultShare> {
    return this.shareRepo.update(id, {
      status: "revoked",
      updatedAt: new Date(),
    });
  }

  async getResultShares(sortResultId: string): Promise<SortResultShare[]> {
    return this.shareRepo.findByResult(sortResultId);
  }

  async isShareValid(token: string): Promise<boolean> {
    const share = await this.shareRepo.findByToken(token);
    if (!share) return false;

    if (share.status === "revoked") return false;

    if (share.expiresAt && new Date() > share.expiresAt) {
      return false;
    }

    return true;
  }
}
