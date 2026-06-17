import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";
import { backfillNumbers } from "@/lib/db/backfill-numbers";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.development.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  console.log("Backfilling session + result numbers…");
  await backfillNumbers(db as any);
  console.log("✅ Backfill complete");
  await client.end({ timeout: 5 });
}

main().catch((e) => {
  console.error("❌ Backfill failed:", e);
  process.exit(1);
});
