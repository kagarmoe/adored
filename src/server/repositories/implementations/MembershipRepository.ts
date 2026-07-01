import { eq, and } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { membershipsTable, user } from "@/lib/db/schema";
import type { IMembershipRepository } from "../MembershipRepository";
import type { CollectionMembership } from "@/types";
import { generateId } from "@/lib/id";

export class MembershipRepository implements IMembershipRepository {
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    collectionId: string;
    userId: string;
    role?: "owner" | "curator";
  }): Promise<CollectionMembership> {
    const [mem] = await this.db
      .insert(membershipsTable)
      .values(this.toInsertValues(data))
      .returning();
    return this.mapToMembership(mem);
  }

  async createIfAbsent(data: {
    id?: string;
    collectionId: string;
    userId: string;
    role?: "owner" | "curator";
  }): Promise<CollectionMembership | null> {
    // onConflictDoNothing on the (collection_id, user_id) unique index: a
    // duplicate insert is a no-op that raises NO error, so this is safe to call
    // inside a transaction (postgres-js would otherwise latch a 23505 error and
    // roll back the whole tx at scope end). Returns null when nothing was inserted.
    const [mem] = await this.db
      .insert(membershipsTable)
      .values(this.toInsertValues(data))
      .onConflictDoNothing({
        target: [membershipsTable.collectionId, membershipsTable.userId],
      })
      .returning();
    return mem ? this.mapToMembership(mem) : null;
  }

  private toInsertValues(data: {
    id?: string;
    collectionId: string;
    userId: string;
    role?: "owner" | "curator";
  }) {
    return {
      id: data.id || generateId("mem"),
      collectionId: data.collectionId,
      userId: data.userId,
      role: data.role ?? "curator",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async findById(id: string): Promise<CollectionMembership | null> {
    const [mem] = await this.db
      .select()
      .from(membershipsTable)
      .where(eq(membershipsTable.id, id));
    return mem ? this.mapToMembership(mem) : null;
  }

  async findByUser(userId: string, collectionId: string): Promise<CollectionMembership | null> {
    const [mem] = await this.db
      .select()
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.userId, userId),
          eq(membershipsTable.collectionId, collectionId),
        ),
      );
    return mem ? this.mapToMembership(mem) : null;
  }

  async findByCollection(collectionId: string): Promise<CollectionMembership[]> {
    // LEFT JOIN the user table so each accepted member carries the person-side
    // name + email the Members screen renders (avatar initial + email line).
    // The base memberships table holds only user_id; without this join those
    // optional fields stay undefined. LEFT (not INNER) so a membership whose
    // user row somehow went missing still lists, just without name/email.
    const rows = await this.db
      .select({
        membership: membershipsTable,
        name: user.name,
        email: user.email,
      })
      .from(membershipsTable)
      .leftJoin(user, eq(membershipsTable.userId, user.id))
      .where(eq(membershipsTable.collectionId, collectionId));
    return rows.map((r) => ({
      ...this.mapToMembership(r.membership),
      name: r.name ?? undefined,
      email: r.email ?? undefined,
    }));
  }

  async update(id: string, _data: Partial<CollectionMembership>): Promise<CollectionMembership> {
    // Allow-list: no caller-supplied fields are permitted through membership update.
    // Role, flags, collectionId, and userId are immutable after creation.
    // Only updatedAt is written to mark the row touched.
    const [mem] = await this.db
      .update(membershipsTable)
      .set({ updatedAt: new Date() })
      .where(eq(membershipsTable.id, id))
      .returning();
    return this.mapToMembership(mem);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(membershipsTable).where(eq(membershipsTable.id, id));
  }

  async deleteByCollection(collectionId: string): Promise<void> {
    await this.db.delete(membershipsTable).where(eq(membershipsTable.collectionId, collectionId));
  }

  // Delete every membership for the given user across all collections.
  // Used during account deletion to remove the user's curator memberships in
  // borrowed collections (after child rows have been removed). Account-deletion only.
  async deleteByUser(userId: string): Promise<void> {
    await this.db.delete(membershipsTable).where(eq(membershipsTable.userId, userId));
  }

  private mapToMembership(row: any): CollectionMembership {
    return {
      id: row.id,
      collectionId: row.collectionId,
      userId: row.userId,
      role: row.role || "curator",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
