import type { SortResultShare } from "@/types";

export interface ISortResultShareRepository {
  create(data: {
    sortResultId: string;
    shareToken: string;
    expiresAt?: Date;
  }): Promise<SortResultShare>;
  findById(id: string): Promise<SortResultShare | null>;
  findByToken(token: string): Promise<SortResultShare | null>;
  findByResult(sortResultId: string): Promise<SortResultShare[]>;
  update(id: string, data: Partial<SortResultShare>): Promise<SortResultShare>;
}
