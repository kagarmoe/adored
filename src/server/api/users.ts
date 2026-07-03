import { z } from "zod";
import type { User } from "@/types";
import type { Database } from "@/lib/db";
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
    return this.userRepo.update(userId, { name: parsed.name === "" ? null : parsed.name });
  }

  async deleteCurrentUser(userId: string): Promise<void> {
    await new AccountDeletionService(this.db).deleteCurrentUser(userId);
  }
}
