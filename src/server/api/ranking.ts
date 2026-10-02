import { z } from "zod";
import type { Database } from "@/lib/db";
import { ClientKey } from "@/lib/decision-batch-schema";
import { SortResultService, type SavedRanking } from "@/server/services/SortResultService";
import type { Pin } from "@/server/services/sortResultMaterialization";

const PinSchema = z.strictObject({ position: z.number().int().min(1).max(10_000) });
const SaveSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  saveKey: ClientKey,
});

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

  save(collectionId: string, curatorId: string, body: unknown): Promise<SavedRanking> {
    const { name, saveKey } = SaveSchema.parse(body);
    return this.service.saveAndShare(collectionId, curatorId, name, saveKey);
  }
}
