import { eq, and } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { invitationsTable } from "@/lib/db/schema";
import type { IInvitationRepository } from "../InvitationRepository";
import type { Invitation } from "@/types";

export class InvitationRepository implements IInvitationRepository {
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    collectionId: string;
    email: string;
    token: string;
    canManageCollection: boolean;
    canInviteMembers: boolean;
    canAddItems: boolean;
    canEditMetadata: boolean;
    canAddPhotos: boolean;
    canDeletePhotos: boolean;
    canSort: boolean;
    canViewOutputs: boolean;
  }): Promise<Invitation> {
    const id = data.id || `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const [inv] = await this.db
      .insert(invitationsTable)
      .values({
        id,
        collectionId: data.collectionId,
        email: data.email,
        token: data.token,
        canManageCollection: data.canManageCollection,
        canInviteMembers: data.canInviteMembers,
        canAddItems: data.canAddItems,
        canEditMetadata: data.canEditMetadata,
        canAddPhotos: data.canAddPhotos,
        canDeletePhotos: data.canDeletePhotos,
        canSort: data.canSort,
        canViewOutputs: data.canViewOutputs,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
        acceptedAt: null,
      })
      .returning();
    return this.mapToInvitation(inv);
  }

  async findById(id: string): Promise<Invitation | null> {
    const [inv] = await this.db
      .select()
      .from(invitationsTable)
      .where(eq(invitationsTable.id, id));
    return inv ? this.mapToInvitation(inv) : null;
  }

  async findByToken(token: string): Promise<Invitation | null> {
    const [inv] = await this.db
      .select()
      .from(invitationsTable)
      .where(eq(invitationsTable.token, token));
    return inv ? this.mapToInvitation(inv) : null;
  }

  async findByCollection(collectionId: string): Promise<Invitation[]> {
    const invs = await this.db
      .select()
      .from(invitationsTable)
      .where(eq(invitationsTable.collectionId, collectionId));
    return invs.map((i) => this.mapToInvitation(i));
  }

  async findByEmail(email: string, collectionId: string): Promise<Invitation | null> {
    const [inv] = await this.db
      .select()
      .from(invitationsTable)
      .where(
        and(eq(invitationsTable.email, email), eq(invitationsTable.collectionId, collectionId)),
      );
    return inv ? this.mapToInvitation(inv) : null;
  }

  async update(id: string, data: Partial<Invitation>): Promise<Invitation> {
    const [inv] = await this.db
      .update(invitationsTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(invitationsTable.id, id))
      .returning();
    return this.mapToInvitation(inv);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(invitationsTable).where(eq(invitationsTable.id, id));
  }

  private mapToInvitation(row: any): Invitation {
    return {
      id: row.id,
      collectionId: row.collectionId,
      email: row.email,
      token: row.token,
      canManageCollection: row.canManageCollection,
      canInviteMembers: row.canInviteMembers,
      canAddItems: row.canAddItems,
      canEditMetadata: row.canEditMetadata,
      canAddPhotos: row.canAddPhotos,
      canDeletePhotos: row.canDeletePhotos,
      canSort: row.canSort,
      canViewOutputs: row.canViewOutputs,
      status: row.status as "pending" | "accepted" | "revoked",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      acceptedAt: row.acceptedAt,
    };
  }
}
