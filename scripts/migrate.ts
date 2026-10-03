import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import path from "path";
import dotenv from "dotenv";
import { ensureLockTimeout } from "./lock-timeout";

// Load environment variables from .env.local or .env.development.local
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.development.local" });

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// A migration's DDL takes ACCESS EXCLUSIVE; while it WAITS for that lock, every
// new read of the table queues behind it. Cap the wait at 5 s so a busy table
// fails the deploy loudly (rolled back, safe to re-run) instead of stalling prod
// reads. The direct (non-pooling) URL is preferred so the startup parameter and the
// migration transaction share one backend; on the pooled DATABASE_URL fallback the
// setting is verified by ensureLockTimeout before migrating.
const sql = postgres(databaseUrl, { max: 1, connection: { lock_timeout: 5_000 } });
const db = drizzle(sql);

const migrationsFolder = path.resolve(process.cwd(), "drizzle");

async function runMigrations() {
  console.log("Running migrations...");
  try {
    console.log(`migrate: using ${process.env.POSTGRES_URL_NON_POOLING ? "non-pooling" : "DATABASE_URL"} connection`);
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
