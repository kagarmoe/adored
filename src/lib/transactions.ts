import type { Database } from "@/lib/db";
import { logDbError, type DbErrorContext } from "@/lib/db-error-log";

export async function withTransaction<T>(
  db: Database,
  callback: (tx: Database) => Promise<T>,
  ctx?: DbErrorContext,
): Promise<T> {
  try {
    return await db.transaction(async (tx: Database) => {
      return callback(tx);
    });
  } catch (err) {
    // A thrown callback (or a driver-level timeout/deadlock) rolled the tx back.
    // Log a generic breadcrumb on the way out then rethrow — behavior is
    // unchanged. The caller's own catch adds the richer op/ctx (e.g. the
    // decisions route logs "record_decision" with full ids).
    logDbError("transaction", ctx ?? {}, err);
    throw err;
  }
}
