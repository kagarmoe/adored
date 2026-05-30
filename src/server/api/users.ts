import { z } from "zod";
import type { User } from "@/types";
import type { IUserRepository } from "@/server/repositories/UserRepository";

const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export class UserController {
  constructor(private userRepo: IUserRepository) {}

  async getCurrentUser(userId: string): Promise<User> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  }

  async updateCurrentUser(userId: string, data: unknown): Promise<User> {
    const parsed = UpdateUserSchema.parse(data);
    return this.userRepo.update(userId, {
      ...(parsed.name && { name: parsed.name }),
      ...(parsed.email && { email: parsed.email }),
    });
  }

  async deleteCurrentUser(userId: string): Promise<User> {
    return this.userRepo.softDelete(userId);
  }
}
