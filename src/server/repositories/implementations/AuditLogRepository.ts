import { eq, desc } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { auditLogTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import type {
  AuditAction,
  AuditLog,
  AuditTargetType,
  NewAuditLog,
} from "@/types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

// Always clamp: a hostile/absent ?limit= must never produce an unbounded scan.
function clampLimit(raw: number | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(n))) : DEFAULT_LIMIT;
}

// Constructed on whatever Database it's given: the injected db for reads, a tx
// for the atomic purge write. No optional-tx overload — a non-tx write must be
// impossible to express (see ItemPurgeService).
export class AuditLogRepository {
  constructor(private db: Database) {}

  async record(entry: NewAuditLog): Promise<void> {
    await this.db.insert(auditLogTable).values({
      id: generateId("audit"),
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      collectionId: entry.collectionId,
      metadata: entry.metadata ?? null,
    });
  }

  // Newest-first, total order (createdAt then id) so same-ms ties are stable.
  async findByCollection(
    collectionId: string,
    opts?: { limit?: number },
  ): Promise<AuditLog[]> {
    const rows = await this.db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.collectionId, collectionId))
      .orderBy(desc(auditLogTable.createdAt), desc(auditLogTable.id))
      .limit(clampLimit(opts?.limit));
    return rows.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      action: row.action as AuditAction,
      targetType: row.targetType as AuditTargetType,
      targetId: row.targetId,
      collectionId: row.collectionId,
      metadata: (row.metadata as Record<string, number> | null) ?? null,
      createdAt: row.createdAt,
    }));
  }
}
