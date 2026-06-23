import type { Database } from "@/lib/db";
import type { AuditLog } from "@/types";
import { AuditLogRepository } from "@/server/repositories/implementations/AuditLogRepository";

export class AuditController {
  constructor(private auditRepo: AuditLogRepository) {}

  static fromDb(db: Database): AuditController {
    return new AuditController(new AuditLogRepository(db));
  }

  async listByCollection(collectionId: string, opts?: { limit?: number }): Promise<AuditLog[]> {
    return this.auditRepo.findByCollection(collectionId, opts);
  }
}
