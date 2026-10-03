import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import path from "path";
import dotenv from "dotenv";
import { ensureLockTimeout } from "./lock-timeout";
import { pickMigrationUrl } from "./migration-url";

// Load environment variables from .env.local or .env.development.local
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.development.local" });

// Direct URL only when DATABASE_URL is the pooler host; test/local URLs are never
// overridden by a pulled Vercel var (see pickMigrationUrl).
const { url: databaseUrl, kind: urlKind, host: urlHost } = pickMigrationUrl({
  DATABASE_URL: process.env.DATABASE_URL,
  POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING,
});

// A migration's DDL takes ACCESS EXCLUSIVE; while it WAITS for that lock, every
// new read of the table queues behind it. Cap the wait at 5 s so a busy table
// fails the deploy loudly (rolled back, safe to re-run) instead of stalling prod
// reads. Against a pooler, the direct URL keeps the startup parameter and the
// migration transaction on one backend; ensureLockTimeout verifies the setting is
// live and refuses to migrate otherwise.
const sql = postgres(databaseUrl, { max: 1, connection: { lock_timeout: 5_000 } });
const db = drizzle(sql);

const migrationsFolder = path.resolve(process.cwd(), "drizzle");

async function runMigrations() {
  console.log("Running migrations...");
  try {
    // Hostname only — never the URL, which carries credentials.
    console.log(`migrate: using ${urlKind} connection (${urlHost})`);
    console.log(`lock_timeout: ${await ensureLockTimeout(sql)}`);
    await migrate(db, { migrationsFolder });
    console.log("✅ Migrations completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigrations();
