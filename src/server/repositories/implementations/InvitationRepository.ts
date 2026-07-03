import { eq, and } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { invitationsTable } from "@/lib/db/schema";
import type { Invitation } from "@/types";
import { generateId } from "@/lib/id";

export class InvitationRepository {
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    collectionId: string;
    email: string;
    token: string;
  }): Promise<Invitation> {
    const id = data.id || generateId("inv");
    const [inv] = await this.db
      .insert(invitationsTable)
      .values({
        id,
        collectionId: data.collectionId,
        email: data.email,
        token: data.token,
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
    // Allow-list: only status and acceptedAt may be updated by callers.
    // Flags, email, collectionId, and token are immutable after creation.
    const [inv] = await this.db
      .update(invitationsTable)
      .set({
        ...(data.status !== undefined && { status: data.status }),
        ...(data.acceptedAt !== undefined && { acceptedAt: data.acceptedAt }),
        updatedAt: new Date(),
      })
      .where(eq(invitationsTable.id, id))
      .returning();
    return this.mapToInvitation(inv);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(invitationsTable).where(eq(invitationsTable.id, id));
  }

  async deleteByCollection(collectionId: string): Promise<void> {
    await this.db.delete(invitationsTable).where(eq(invitationsTable.collectionId, collectionId));
  }

  // Scrub the email (NOT delete the row). Used during account deletion for an
  // invitation the user accepted in ANOTHER owner's collection: the invitation
  // belongs to that owner's collection (survives), but its email must no longer
  // identify the deleted user. Matches by the user's OLD email. Returns the
  // affected-row count.
  async scrubEmail(oldEmail: string, tombstone: string): Promise<number> {
    const rows = await this.db
      .update(invitationsTable)
      .set({ email: tombstone, updatedAt: new Date() })
      .where(eq(invitationsTable.email, oldEmail))
      .returning({ id: invitationsTable.id });
    return rows.length;
  }

  private mapToInvitation(row: any): Invitation {
    return {
      id: row.id,
      collectionId: row.collectionId,
      email: row.email,
      token: row.token,
      status: row.status as "pending" | "accepted" | "revoked",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      acceptedAt: row.acceptedAt,
    };
  }
}
