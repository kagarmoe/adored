import { eq, inArray } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { decisionEventsTable, sessionsTable } from "@/lib/db/schema";
import type { IDecisionEventRepository } from "../DecisionEventRepository";
import type { DecisionEvent, TriageDecision, PairwiseDecision } from "@/types";
import { generateId } from "@/lib/id";

export class DecisionEventRepository implements IDecisionEventRepository {
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    sessionId: string;
    type: "triage" | "pairwise_compare";
    decision: TriageDecision | PairwiseDecision;
  }): Promise<DecisionEvent> {
    const id = data.id || generateId("evt");
    const [event] = await this.db
      .insert(decisionEventsTable)
      .values({
        id,
        sessionId: data.sessionId,
        type: data.type,
        decision: data.decision,
        createdAt: new Date(),
      })
      .returning();
    return this.mapToDecisionEvent(event);
  }

  async findById(id: string): Promise<DecisionEvent | null> {
    const [event] = await this.db
      .select()
      .from(decisionEventsTable)
      .where(eq(decisionEventsTable.id, id));
    return event ? this.mapToDecisionEvent(event) : null;
  }

  async findBySession(sessionId: string): Promise<DecisionEvent[]> {
    const events = await this.db
      .select()
      .from(decisionEventsTable)
      .where(eq(decisionEventsTable.sessionId, sessionId));
    return events.map((e) => this.mapToDecisionEvent(e));
  }

  // Delete every decision of this collection's sessions (decisions have no
  // collection_id — scope via the parent sessions). Purge-only.
  async deleteByCollection(collectionId: string): Promise<void> {
    await this.db.delete(decisionEventsTable).where(
      inArray(
        decisionEventsTable.sessionId,
        this.db
          .select({ id: sessionsTable.id })
          .from(sessionsTable)
          .where(eq(sessionsTable.collectionId, collectionId)),
      ),
    );
  }

  // Delete every decision_event whose parent session belongs to the given curator.
  // Child-first prerequisite for deleteByCurator on sessions. Account-deletion only.
  async deleteByCurator(curatorId: string): Promise<void> {
    await this.db.delete(decisionEventsTable).where(
      inArray(
        decisionEventsTable.sessionId,
        this.db
          .select({ id: sessionsTable.id })
          .from(sessionsTable)
          .where(eq(sessionsTable.curatorId, curatorId)),
      ),
    );
  }

  private mapToDecisionEvent(row: any): DecisionEvent {
    return {
      id: row.id,
      sessionId: row.sessionId,
      type: row.type as "triage" | "pairwise_compare",
      decision: row.decision as TriageDecision | PairwiseDecision,
      createdAt: row.createdAt,
    };
  }
}
