import type { Database } from "@/lib/db";
import type { DecisionEvent } from "@/types";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";

export class DecisionController {
  constructor(private decisionRepo: DecisionEventRepository) {}

  static fromDb(db: Database): DecisionController {
    return new DecisionController(new DecisionEventRepository(db));
  }

  async listBySession(sessionId: string): Promise<DecisionEvent[]> {
    return this.decisionRepo.findBySession(sessionId);
  }
}
