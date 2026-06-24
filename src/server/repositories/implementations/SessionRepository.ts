import { eq, and, isNull, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { sessionsTable } from "@/lib/db/schema";
import type { ISessionRepository } from "../SessionRepository";
import type { Session } from "@/types";
import { generateId } from "@/lib/id";

export class SessionRepository implements ISessionRepository {
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    collectionId: string;
    curatorId: string;
    goal?: string;
  }): Promise<Session> {
    const base = {
      id: data.id || generateId("sess"),
      collectionId: data.collectionId,
      curatorId: data.curatorId,
      status: "active",
      goal: data.goal || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    // Auto-allocate MAX+1, retry on the UNIQUE(collection_id, number) race
    // (a retry-able insert — simpler than locking the max; a transaction is available but unnecessary here). Any other
    // unique violation (e.g. sessions_active_unique) surfaces, not retried.
    for (let attempt = 0; attempt < 5; attempt++) {
      const number = await this.getNextSessionNumber(data.collectionId);
      try {
        const [session] = await this.db
          .insert(sessionsTable)
          .values({ ...base, number })
          .returning();
        return this.mapToSession(session);
      } catch (error) {
        if (isSessionNumberConflict(error) && attempt < 4) continue;
        throw error;
      }
    }
    throw new Error("Could not allocate a session number");
  }

  async findById(id: string): Promise<Session | null> {
    const [session] = await this.db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.id, id), isNull(sessionsTable.deletedAt)));
    return session ? this.mapToSession(session) : null;
  }

  async findByIdIncludingDeleted(id: string): Promise<Session | null> {
    const [session] = await this.db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, id));
    return session ? this.mapToSession(session) : null;
  }

  async findByCollectionAndNumber(
    collectionId: string,
    number: number,
  ): Promise<Session | null> {
    const [session] = await this.db
      .select()
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.collectionId, collectionId),
          eq(sessionsTable.number, number),
          isNull(sessionsTable.deletedAt),
        ),
      );
    return session ? this.mapToSession(session) : null;
  }

  async getNextSessionNumber(collectionId: string): Promise<number> {
    // MAX over ALL rows (incl. soft-deleted) — a deleted session still holds its
    // number in the UNIQUE(collection_id, number) index, so reusing it would
    // collide. Resolution (findByCollectionAndNumber) excludes deleted rows.
    const [row] = await this.db
      .select({ max: sql<number | null>`max(${sessionsTable.number})` })
      .from(sessionsTable)
      .where(eq(sessionsTable.collectionId, collectionId));
    return (row?.max ?? 0) + 1;
  }

  async findActive(collectionId: string, curatorId: string): Promise<Session | null> {
    const [session] = await this.db
      .select()
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.collectionId, collectionId),
          eq(sessionsTable.curatorId, curatorId),
          eq(sessionsTable.status, "active"),
          isNull(sessionsTable.deletedAt),
        ),
      );
    return session ? this.mapToSession(session) : null;
  }

  async findByCollection(collectionId: string): Promise<Session[]> {
    const sessions = await this.db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.collectionId, collectionId), isNull(sessionsTable.deletedAt)));
    return sessions.map((s) => this.mapToSession(s));
  }

  // purses-t9l: each user sorts independently — the sort list/dashboard show only
  // the current user's own sessions, never another curator's.
  async findByCollectionAndCurator(
    collectionId: string,
    curatorId: string,
  ): Promise<Session[]> {
    const sessions = await this.db
      .select()
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.collectionId, collectionId),
          eq(sessionsTable.curatorId, curatorId),
          isNull(sessionsTable.deletedAt),
        ),
      );
    return sessions.map((s) => this.mapToSession(s));
  }

  async update(id: string, data: Partial<Session>): Promise<Session> {
    const [session] = await this.db
      .update(sessionsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sessionsTable.id, id))
      .returning();
    return this.mapToSession(session);
  }

  async softDelete(id: string): Promise<Session> {
    const [session] = await this.db
      .update(sessionsTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(sessionsTable.id, id))
      .returning();
    return this.mapToSession(session);
  }

  async restore(id: string): Promise<Session> {
    const [session] = await this.db
      .update(sessionsTable)
      .set({ deletedAt: null, status: "active", updatedAt: new Date() })
      .where(eq(sessionsTable.id, id))
      .returning();
    return this.mapToSession(session);
  }

  async deleteByCollection(collectionId: string): Promise<void> {
    await this.db.delete(sessionsTable).where(eq(sessionsTable.collectionId, collectionId));
  }

  // Delete every session belonging to the given curator (across all collections).
  // Caller must have already deleted child decision_events. Account-deletion only.
  async deleteByCurator(curatorId: string): Promise<void> {
    await this.db.delete(sessionsTable).where(eq(sessionsTable.curatorId, curatorId));
  }

  private mapToSession(row: any): Session {
    return {
      id: row.id,
      collectionId: row.collectionId,
      curatorId: row.curatorId,
      number: row.number ?? null,
      status: row.status as "active" | "paused" | "completed" | "abandoned" | "deleted",
      goal: row.goal,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}

function isSessionNumberConflict(error: unknown): boolean {
  // Retry ONLY the UNIQUE(collection_id, number) race — any other unique
  // violation (incl. sessions_active_unique) is a real condition and must surface.
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message ?? "";
  return code === "23505" && message.includes("sessions_collection_number_unique");
}
