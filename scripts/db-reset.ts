/**
 * db-reset — DESTRUCTIVE. Drops the schema and re-derives it from drizzle/.
 *
 * The declarative way to bring a database to the schema `src/lib/db/schema.ts`
 * declares: drop everything, then run the real migrator. Same operation for dev,
 * preview, and prod — only the target differs.
 *
 * REFUSES AN AMBIENT `DATABASE_URL`. scripts/migrate.ts loads .env.local via
 * dotenv, and dotenv does NOT override an already-set var — so a stray exported
 * DATABASE_URL silently beats .env.local. That is survivable for a migration and
 * catastrophic for a DROP: you would reset "dev" and drop prod. So the target must
 * be typed on the command line AND echoed back. There is deliberately no --force:
 * a flag is re-runnable from shell history against the wrong database; typing the
 * host is not.
 *
 * USAGE: npm run db:reset -- --database-url <url>
 */
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import postgres from "postgres";

async function main(): Promise<void> {
  const i = process.argv.indexOf("--database-url");
  const url = i > 0 ? process.argv[i + 1] : undefined;
  if (!url) {
    throw new Error(
      "pass --database-url <url>. An ambient DATABASE_URL is refused — see the docblock.",
    );
  }

  const { hostname, pathname } = new URL(url);
  const target = `${hostname}${pathname}`;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await rl.question(
    `\n⚠️  db:reset DROPS ALL DATA in ${target}\n   Type the target to confirm: `,
  );
  rl.close();
  if (typed.trim() !== target) throw new Error("confirmation did not match — aborted.");

  const sql = postgres(url, { max: 1 });
  try {
    // BOTH schemas. The migrator's ledger is `drizzle.__drizzle_migrations`, not
    // public (pg-core/dialect.js defaults migrationsSchema to "drizzle"). Dropping
    // only public leaves those rows alive, and the next migrate then finds its
    // newest entry already recorded, applies NOTHING, and reports success against
    // an empty database.
    await sql.unsafe(
      `DROP SCHEMA IF EXISTS public CASCADE;
       DROP SCHEMA IF EXISTS drizzle CASCADE;
       CREATE SCHEMA public;`,
    );
  } finally {
    await sql.end();
  }

  // Reuse the real migrator rather than reimplementing it. An explicitly-passed
  // DATABASE_URL wins over .env.local (dotenv never overrides a set var), so the
  // child targets exactly the database we just confirmed.
  execFileSync("npm", ["run", "db:migrate"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}

main().catch((error: Error) => {
  console.error("❌ db:reset:", error.message);
  process.exit(1);
});
