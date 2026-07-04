import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { user, account, session, verification } from "@/lib/db/schema";
import type { User } from "@/types";
import { withTransaction } from "@/lib/transactions";
import { accountTombstone } from "@/server/services/account-tombstone";

export class UserRepository {
  constructor(private db: Database) {}

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
    // Off the drizzle table's insert shape so it tracks NOT NULL columns (e.g.
    // `name` cannot be null under better-auth's canonical `user`).
    data: Partial<Omit<typeof user.$inferInsert, "id" | "createdAt">>,
  ): Promise<User> {
    const [result] = await this.db
      .update(user)
      .set(data)
      .where(eq(user.id, id))
      .returning();
    return this.mapToUser(result);
  }

  /**
   * Permanently scrub PII from the user row and delete all auth records, in ONE
   * transaction. Called AFTER all owned/borrowed collection data has been erased.
   *
   * better-auth owns auth now, so the credential/session state lives in its
   * canonical tables:
   * - email → tombstone (keeps the unique index valid)
   * - name → tombstone (user.name is NOT NULL) / image → null / emailVerified → false
   * - account rows (incl. the scrypt password) → hard-deleted by user_id
   * - session rows → hard-deleted by user_id (logs the user out everywhere)
   * - verification rows for the OLD email → hard-deleted (no stale magic-link)
   *
   * Returns the captured oldEmail so the caller can scrub other rows (e.g.
   * invitations) that identify the user by that email.
   */
  async purgeAndScrub(id: string): Promise<{ oldEmail: string | null }> {
    return withTransaction(this.db, async (tx) => {
      // Capture the old email before scrubbing so we can purge verifications.
      const [existing] = await tx.select({ email: user.email }).from(user).where(eq(user.id, id));
      const oldEmail = existing?.email ?? null;

      // Delete auth records first: `account` holds the scrypt password, `session`
      // holds live tokens. These would cascade if the user row were dropped, but
      // we keep the row scrubbed as a tombstone instead.
      await tx.delete(account).where(eq(account.userId, id));
      await tx.delete(session).where(eq(session.userId, id));
      if (oldEmail) {
        await tx.delete(verification).where(eq(verification.identifier, oldEmail));
      }

      // Scrub PII on the user row; keep the row so FK references (e.g.
      // audit_log.actor_id, collections.owner_id on already-purged collections)
      // remain resolvable as a tombstone. `name` is NOT NULL, so it is set to the
      // tombstone email rather than null.
      const tombstone = accountTombstone(id);
      await tx
        .update(user)
        .set({
          email: tombstone,
          name: tombstone,
          image: null,
          emailVerified: false,
          updatedAt: new Date(),
        })
        .where(eq(user.id, id));

      return { oldEmail };
    });
  }

  private mapToUser(row: typeof user.$inferSelect): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: null,
    };
  }
}
