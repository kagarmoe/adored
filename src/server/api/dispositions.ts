import { z } from "zod";
import type { Database } from "@/lib/db";
import type { ItemDisposition, Disposition } from "@/types";
import { withTransaction, lockCollectionCurator } from "@/lib/transactions";
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
    private db: Database,
  ) {}

  static fromDb(db: Database): DispositionController {
    return new DispositionController(new ItemDispositionRepository(db), db);
  }

  async setDisposition(
    collectionId: string,
    curatorId: string,
    data: unknown,
  ): Promise<ItemDisposition> {
    const { itemId, disposition } = SetDispositionSchema.parse(data);
    // duv4: check-then-act (findByItem → upsert) on the plain handle raced the
    // triage path — an item could end up BOTH preference'd (by a concurrent
    // recompute) and disposed, the "impossible" state. Run inside a transaction
    // holding the SAME shared (collection,curator) advisory lock the decisions
    // route takes, and RE-CHECK findByItem under the lock so the preference guard
    // can't be invalidated between the read and the upsert.
    return withTransaction(this.db, async (tx) => {
      await lockCollectionCurator(tx, collectionId, curatorId);
      const preferenceRepo = new CollectionPreferenceItemRepository(tx);
      const dispositionRepo = new ItemDispositionRepository(tx);
      // disposed <=> untriaged: refuse if the item already has a preference for this curator.
      const existing = await preferenceRepo.findByItem(itemId, curatorId);
      if (existing) throw new PreferenceExistsError();
      return dispositionRepo.upsert({ collectionId, curatorId, itemId, disposition });
    }, {
      op: "set_disposition",
      ctx: { collectionId, curatorId, itemId },
    });
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
