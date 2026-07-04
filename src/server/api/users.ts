import { z } from "zod";
import { eq } from "drizzle-orm";
import type { User } from "@/types";
import type { Database } from "@/lib/db";
import { baUser } from "@/lib/db/better-auth-schema";
import { AccountDeletionService } from "@/server/services/AccountDeletionService";
import { UserRepository } from "@/server/repositories/implementations/UserRepository";

const UpdateUserSchema = z.object({
  // name-only flow: trim, bound length, allow empty (= clear). Unknown keys stripped.
  name: z.string().trim().max(80).optional(),
});


export class UserController {
  constructor(
    private userRepo: UserRepository,
    private db: Database,
  ) {}

  static fromDb(db: Database): UserController {
    return new UserController(new UserRepository(db), db);
  }

  async getCurrentUser(userId: string): Promise<User> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  }

  async updateCurrentUser(userId: string, data: unknown): Promise<User> {
    const parsed = UpdateUserSchema.parse(data);
    // No-op when there is nothing to set (email-only or empty body). An empty
    // patch would issue an UPDATE with no SET clause → DB error; return as-is.
    if (parsed.name === undefined) return this.getCurrentUser(userId);
    const name = parsed.name === "" ? null : parsed.name;
    const updated = await this.userRepo.update(userId, { name });
    // The session's display name is served from better-auth's `ba_user` (the
    // façade getSession() and the client's useSession() both read it), so mirror
    // the change there too — keyed by the shared id (post-cutover a real user's
    // ba_user.id equals their user.id). `ba_user.name` is NOT NULL, so a cleared
    // name falls back to the email local-part rather than writing null. Without
    // this, an edit updates the domain row but the header keeps the old name.
    await this.db
      .update(baUser)
      .set({ name: name ?? updated.email.split("@")[0], updatedAt: new Date() })
      .where(eq(baUser.id, userId));
    return updated;
  }

  async deleteCurrentUser(userId: string): Promise<void> {
    await new AccountDeletionService(this.db).deleteCurrentUser(userId);
  }
}
