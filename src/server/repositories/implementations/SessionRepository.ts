import { eq, and, isNull } from "drizzle-orm";
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
    const id = data.id || generateId("sess");
    const [session] = await this.db
      .insert(sessionsTable)
      .values({
        id,
        collectionId: data.collectionId,
        curatorId: data.curatorId,
        status: "active",
        goal: data.goal || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      })
      .returning();
    return this.mapToSession(session);
  }

  async findById(id: string): Promise<Session | null> {
    const [session] = await this.db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.id, id), isNull(sessionsTable.deletedAt)));
    return session ? this.mapToSession(session) : null;
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

  async update(id: string, data: Partial<Session>): Promise<Session> {
    const [session] = await this.db
      .update(sessionsTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(sessionsTable.id, id))
      .returning();
    return this.mapToSession(session);
  }

  async softDelete(id: string): Promise<Session> {
    const [session] = await this.db
      .update(sessionsTable)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sessionsTable.id, id))
      .returning();
    return this.mapToSession(session);
  }

  private mapToSession(row: any): Session {
    return {
      id: row.id,
      collectionId: row.collectionId,
      curatorId: row.curatorId,
      status: row.status as "active" | "paused" | "completed" | "abandoned" | "deleted",
      goal: row.goal,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}
