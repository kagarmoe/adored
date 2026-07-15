import { existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { Database } from "@/lib/db";
import { generateId } from "@/lib/id";
import { withTransaction } from "@/lib/transactions";
import { SAMPLE_ITEMS, type SampleItem } from "@/features/onboarding/sampleData";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";

const DEV_SAMPLE_COLLECTION_NAME = "Sample collection";
const DEV_SAMPLE_COLLECTION_DESCRIPTION =
  "A small generated collection for local development.";
const DEV_SAMPLE_ITEM_COUNT = 5;
const DEMO_SEED_PREFIX = "demo-seed-placeholder/";

const inFlight = new Map<string, Promise<void>>();

export function selectRandomSampleItems(
  items: readonly SampleItem[],
  count: number,
  random: () => number = Math.random,
): SampleItem[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export async function ensureDevSampleCollection(db: Database, userId: string): Promise<void> {
  if (process.env.NODE_ENV !== "development" || process.env.AUTH_BYPASS !== "1") return;

  const existing = inFlight.get(userId);
  if (existing) return existing;

  const next = bootstrapDevSampleCollection(db, userId).finally(() => {
    inFlight.delete(userId);
  });
  inFlight.set(userId, next);
  return next;
}

async function bootstrapDevSampleCollection(db: Database, userId: string): Promise<void> {
  await withTransaction(
    db,
    async (tx) => {
      const collectionRepo = new CollectionRepository(tx);
      const existingCollections = await collectionRepo.findByOwner(userId);
      if (existingCollections.length > 0) return;

      const collection = await collectionRepo.create({
        id: generateId("col"),
        ownerId: userId,
        name: DEV_SAMPLE_COLLECTION_NAME,
        description: DEV_SAMPLE_COLLECTION_DESCRIPTION,
      });

      const itemRepo = new ItemRepository(tx);
      const photoRepo = new PhotoRepository(tx);
      const samples = selectRandomSampleItems(SAMPLE_ITEMS, DEV_SAMPLE_ITEM_COUNT);

      for (const sample of samples) {
        const item = await itemRepo.create({
          collectionId: collection.id,
          name: sample.name,
        });
        const filename = basename(sample.imageSrc);
        const localPath = join(process.cwd(), "public", "onboarding", filename);
        await photoRepo.create({
          itemId: item.id,
          collectionId: collection.id,
          blobKey: `${DEMO_SEED_PREFIX}${filename}`,
          filename,
          mimeType: "image/webp",
          fileSize: existsSync(localPath) ? statSync(localPath).size : null,
          uploadedBy: userId,
          isHero: true,
        });
      }
    },
    { op: "dev_sample_bootstrap", ctx: { curatorId: userId } },
  );
}
