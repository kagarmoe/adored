import { drizzle } from "drizzle-orm/postgres-js";
import { isNull } from "drizzle-orm";
import postgres from "postgres";
import dotenv from "dotenv";
import { collectionsTable } from "@/lib/db/schema";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.development.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  const repo = new CollectionRepository(db as any);

  // Only rows missing a slug — safe to re-run; rows created post-deploy already
  // have slugs and are skipped.
  const rows = await db
    .select({ id: collectionsTable.id, name: collectionsTable.name })
    .from(collectionsTable)
    .where(isNull(collectionsTable.slug));

  console.log(`Backfilling ${rows.length} collections…`);
  for (const row of rows) {
    // update() regenerates the slug from the name with global dedupe.
    const updated = await repo.update(row.id, { name: row.name });
    console.log(`  ${row.id} -> ${updated.slug}`);
  }
  console.log("✅ Backfill complete");
  await client.end({ timeout: 5 });
}

main().catch((e) => {
  console.error("❌ Backfill failed:", e);
  process.exit(1);
});
