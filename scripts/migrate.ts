import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import path from "path";
import dotenv from "dotenv";

// Load environment variables from .env.local or .env.development.local
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.development.local" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const sql = postgres(databaseUrl, { max: 1 });
const db = drizzle(sql);

const migrationsFolder = path.resolve(process.cwd(), "drizzle");

async function runMigrations() {
  console.log("Running migrations...");
  try {
    await migrate(db, { migrationsFolder });
    console.log("✅ Migrations completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigrations();
