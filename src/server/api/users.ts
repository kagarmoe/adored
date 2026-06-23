import { z } from "zod";
import type { User } from "@/types";
import type { IUserRepository } from "@/server/repositories/UserRepository";
import type { Database } from "@/lib/db";
import { AccountDeletionService } from "@/server/services/AccountDeletionService";
import { UserRepository } from "@/server/repositories/implementations/UserRepository";

const UpdateUserSchema = z.object({
  // name-only flow: trim, bound length, allow empty (= clear). Unknown keys stripped.
  name: z.string().trim().max(80).optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export class UserController {
  constructor(
    private userRepo: IUserRepository,
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
    const patch: { name?: string | null } = {};
    if (parsed.name !== undefined) patch.name = parsed.name === "" ? null : parsed.name;
    return this.userRepo.update(userId, patch);
  }

  async deleteCurrentUser(userId: string): Promise<void> {
    await new AccountDeletionService(this.db).deleteCurrentUser(userId);
  }
}
