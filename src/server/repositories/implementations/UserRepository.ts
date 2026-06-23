import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { user, account, session, verificationToken } from "@/lib/db/schema";
import type { IUserRepository } from "../UserRepository";
import type { User } from "@/types";

export class UserRepository implements IUserRepository {
  constructor(private db: Database) {}

  async create(data: { id: string; email: string; name?: string }): Promise<User> {
    const [result] = await this.db
      .insert(user)
      .values({
        id: data.id,
        email: data.email,
        name: data.name || null,
      })
      .returning();
    return this.mapToUser(result);
  }

  async findById(id: string): Promise<User | null> {
    const [result] = await this.db
      .select()
      .from(user)
      .where(eq(user.id, id));
    return result ? this.mapToUser(result) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [result] = await this.db
      .select()
      .from(user)
      .where(eq(user.email, email));
    return result ? this.mapToUser(result) : null;
  }

  async update(
    id: string,
    data: Partial<Omit<User, "id" | "createdAt" | "deletedAt">>,
  ): Promise<User> {
    const [result] = await this.db
      .update(user)
      .set(data)
      .where(eq(user.id, id))
      .returning();
    return this.mapToUser(result);
  }

  async softDelete(id: string): Promise<User> {
    // NextAuth user table doesn't support soft deletes - use update with emailVerified=null
    const [result] = await this.db
      .update(user)
      .set({
        emailVerified: null,
      })
      .where(eq(user.id, id))
      .returning();
    return this.mapToUser(result);
  }

  /**
   * Permanently scrub PII from the user row and delete all auth tokens.
   * Called AFTER all owned/borrowed collection data has been erased.
   *
   * - email → tombstone `deleted+<id>@deleted.invalid` (keeps unique index valid)
   * - name / image / password / emailVerified → null
   * - account + session rows → hard-deleted (NextAuth ON DELETE CASCADE handles
   *   these if the user row were dropped, but we keep the row scrubbed instead)
   * - verificationToken rows for the OLD email → hard-deleted (no stale magic-link)
   */
  async purgeAndScrub(id: string): Promise<void> {
    // Capture the old email before scrubbing so we can purge verificationTokens.
    const [existing] = await this.db.select({ email: user.email }).from(user).where(eq(user.id, id));
    const oldEmail = existing?.email ?? null;

    // Delete auth child rows first (avoid any FK issues on the user row update).
    await this.db.delete(account).where(eq(account.userId, id));
    await this.db.delete(session).where(eq(session.userId, id));
    if (oldEmail) {
      await this.db.delete(verificationToken).where(eq(verificationToken.identifier, oldEmail));
    }

    // Scrub PII on the user row; keep the row so FK references (e.g. audit_log.actor_id,
    // collections.owner_id on already-purged collections) remain resolvable as a tombstone.
    await this.db
      .update(user)
      .set({
        email: `deleted+${id}@deleted.invalid`,
        name: null,
        image: null,
        password: null,
        emailVerified: null,
      })
      .where(eq(user.id, id));
  }

  private mapToUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
  }
}
