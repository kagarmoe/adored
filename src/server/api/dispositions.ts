import { z } from "zod";
import type { Database } from "@/lib/db";
import type { ItemDisposition, Disposition } from "@/types";
import { ItemDispositionRepository } from "@/server/repositories/implementations/ItemDispositionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";

const SetDispositionSchema = z.object({
  itemId: z.string().min(1),
  disposition: z.enum(["set_aside", "deferred"]),
});

export class PreferenceExistsError extends Error {
  constructor() {
    super("Item already has a preference; cannot set a disposition on a triaged item");
    this.name = "PreferenceExistsError";
  }
}

export class DispositionController {
  constructor(
    private dispositionRepo: ItemDispositionRepository,
    private preferenceRepo: CollectionPreferenceItemRepository,
  ) {}

  static fromDb(db: Database): DispositionController {
    return new DispositionController(
      new ItemDispositionRepository(db),
      new CollectionPreferenceItemRepository(db),
    );
  }

  async setDisposition(
    collectionId: string,
    curatorId: string,
    data: unknown,
  ): Promise<ItemDisposition> {
    const { itemId, disposition } = SetDispositionSchema.parse(data);
    // disposed <=> untriaged: refuse if the item already has a preference for this curator.
    const existing = await this.preferenceRepo.findByItem(itemId, curatorId);
    if (existing) throw new PreferenceExistsError();
    return this.dispositionRepo.upsert({ collectionId, curatorId, itemId, disposition });
  }

  async listDispositions(
    collectionId: string,
    curatorId: string,
    disposition?: Disposition,
  ): Promise<ItemDisposition[]> {
    const all = await this.dispositionRepo.findByCollectionAndCurator(collectionId, curatorId);
    return disposition ? all.filter((d) => d.disposition === disposition) : all;
  }

  async bringBack(itemId: string, curatorId: string): Promise<number> {
    return this.dispositionRepo.delete(itemId, curatorId);
  }
}
