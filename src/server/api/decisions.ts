import type { Database } from "@/lib/db";
import type { DecisionEvent } from "@/types";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { loadCuratorDecisionEvents } from "@/server/services/decision-log";

export class DecisionController {
  constructor(
    private decisionRepo: DecisionEventRepository,
    private sessionRepo: SessionRepository,
  ) {}

  static fromDb(db: Database): DecisionController {
    return new DecisionController(new DecisionEventRepository(db), new SessionRepository(db));
  }

  async listBySession(sessionId: string): Promise<DecisionEvent[]> {
    return this.decisionRepo.findBySession(sessionId);
  }

  // The curator's WHOLE cross-session decision log (spec §2.6) — same shared
  // definition the recompute reads, so an item answered in one session is never
  // re-asked by another session's queue.
  async listForCurator(collectionId: string, curatorId: string): Promise<DecisionEvent[]> {
    return loadCuratorDecisionEvents(this.sessionRepo, this.decisionRepo, collectionId, curatorId);
  }
}
