import { z } from "zod";
import type { Database } from "@/lib/db";
import { SortResultService } from "@/server/services/SortResultService";
import type { Pin } from "@/server/services/sortResultMaterialization";

const PinSchema = z.strictObject({ position: z.number().int().min(1).max(10_000) });

/** The live Ranking's writes (spec §4). Curator is always the caller, never the body. */
export class RankingController {
  constructor(private service: SortResultService) {}

  static fromDb(db: Database): RankingController {
    return new RankingController(SortResultService.fromDb(db));
  }

  listPins(collectionId: string, curatorId: string): Promise<Pin[]> {
    return this.service.listPins(collectionId, curatorId);
  }

  pin(collectionId: string, curatorId: string, itemId: string, body: unknown): Promise<void> {
    const { position } = PinSchema.parse(body);
    return this.service.pinItem(collectionId, curatorId, itemId, position);
  }

  unpin(collectionId: string, curatorId: string, itemId: string): Promise<void> {
    return this.service.unpinItem(collectionId, curatorId, itemId);
  }
}
