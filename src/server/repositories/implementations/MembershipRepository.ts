import { eq, and } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { membershipsTable } from "@/lib/db/schema";
import type { IMembershipRepository } from "../MembershipRepository";
import type { CollectionMembership } from "@/types";
import { generateId } from "@/lib/id";

export class MembershipRepository implements IMembershipRepository {
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    collectionId: string;
    userId: string;
    canManageCollection: boolean;
    canInviteMembers: boolean;
    canAddItems: boolean;
    canEditMetadata: boolean;
    canAddPhotos: boolean;
    canDeletePhotos: boolean;
    canSort: boolean;
    canViewOutputs: boolean;
  }): Promise<CollectionMembership> {
    const id = data.id || generateId("mem");
    const [mem] = await this.db
      .insert(membershipsTable)
      .values({
        id,
        collectionId: data.collectionId,
        userId: data.userId,
        canManageCollection: data.canManageCollection,
        canInviteMembers: data.canInviteMembers,
        canAddItems: data.canAddItems,
        canEditMetadata: data.canEditMetadata,
        canAddPhotos: data.canAddPhotos,
        canDeletePhotos: data.canDeletePhotos,
        canSort: data.canSort,
        canViewOutputs: data.canViewOutputs,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return this.mapToMembership(mem);
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
    const mems = await this.db
      .select()
      .from(membershipsTable)
      .where(eq(membershipsTable.collectionId, collectionId));
    return mems.map((m) => this.mapToMembership(m));
  }

  async update(id: string, data: Partial<CollectionMembership>): Promise<CollectionMembership> {
    const [mem] = await this.db
      .update(membershipsTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(membershipsTable.id, id))
      .returning();
    return this.mapToMembership(mem);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(membershipsTable).where(eq(membershipsTable.id, id));
  }

  private mapToMembership(row: any): CollectionMembership {
    return {
      id: row.id,
      collectionId: row.collectionId,
      userId: row.userId,
      role: row.role || "curator",
      canManageCollection: row.canManageCollection,
      canInviteMembers: row.canInviteMembers,
      canAddItems: row.canAddItems,
      canDeleteItems: row.canDeleteItems,
      canEditMetadata: row.canEditMetadata,
      canAddPhotos: row.canAddPhotos,
      canDeletePhotos: row.canDeletePhotos,
      canSort: row.canSort,
      canViewOutputs: row.canViewOutputs,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
