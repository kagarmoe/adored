import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { sessionsTable } from "@/lib/db/schema";
import type { ISessionRepository } from "../SessionRepository";
import type { Session } from "@/types";
import { generateId } from "@/lib/id";

/**
 * Thrown when a curator already holds an IN-PROGRESS session in a (collection,
 * curator) slot and tries to occupy it again. After migration 0009 the
 * sessions_active_unique index is PARTIAL — it covers only in-progress rows
 * (deleted_at IS NULL AND status IN ('active','paused')). Terminal (completed/
 * abandoned) and soft-deleted (set-aside) rows no longer hold the slot, so they
 * don't collide. This fires on create into an occupied slot AND on restore that
 * would re-activate a set-aside session a newer one has since superseded. Routes
 * map it to a gentle 409 — never a 500.
 */
export class CurrentSessionExistsError extends Error {
  constructor() {
    super("You already have a sort in progress for this collection.");
    this.name = "CurrentSessionExistsError";
  }
}

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
    // (a retry-able insert — simpler than locking the max; a transaction is available but unnecessary here).
    for (let attempt = 0; attempt < 5; attempt++) {
      const number = await this.getNextSessionNumber(data.collectionId);
      try {
        const [session] = await this.db
          .insert(sessionsTable)
          .values({ ...base, number })
          .returning();
        return this.mapToSession(session);
      } catch (error) {
        // The (collection, curator) slot is held by an IN-PROGRESS session
        // (active or paused, not soft-deleted) — the only rows the partial
        // sessions_active_unique index covers after migration 0009. Terminal
        // and soft-deleted rows free the slot and don't collide. Surface a
        // gentle, typed 409 instead of a raw 500. Not retried — a fresh number
        // won't free a slot held by the curator's live session.
        if (isCurrentSessionConflict(error)) throw new CurrentSessionExistsError();
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

  // The in-progress session (active OR paused, not soft-deleted) holding the
  // partial-index slot — mirrors findActive but widens status to match the
  // partial predicate so restore's pre-check sees a paused holder too.
  async findInProgress(collectionId: string, curatorId: string): Promise<Session | null> {
    const [session] = await this.db
      .select()
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.collectionId, collectionId),
          eq(sessionsTable.curatorId, curatorId),
          inArray(sessionsTable.status, ["active", "paused"]),
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
    try {
      const [session] = await this.db
        .update(sessionsTable)
        .set({ deletedAt: null, status: "active", updatedAt: new Date() })
        .where(eq(sessionsTable.id, id))
        .returning();
      return this.mapToSession(session);
    } catch (error) {
      // The partial index now lets a set-aside session be superseded: a newer
      // in-progress session can occupy the slot while this one is soft-deleted.
      // Re-activating this row would put TWO in-progress sessions in the slot,
      // so the partial unique index raises 23505. Surface a gentle 409, not a
      // raw 500. Mirrors create()'s conflict handling.
      if (isCurrentSessionConflict(error)) throw new CurrentSessionExistsError();
      throw error;
    }
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
  // violation is a real condition and must surface.
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message ?? "";
  return code === "23505" && message.includes("sessions_collection_number_unique");
}

function isCurrentSessionConflict(error: unknown): boolean {
  // The UNIQUE(collection_id, curator_id) slot is occupied. Sibling of
  // isSessionNumberConflict — NOT retried; mapped to a gentle 409.
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message ?? "";
  return code === "23505" && message.includes("sessions_active_unique");
}
