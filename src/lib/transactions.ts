import type { Database } from "@/lib/db";

export async function withTransaction<T>(
  db: Database,
  callback: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx: Database) => {
    return callback(tx);
  });
}
