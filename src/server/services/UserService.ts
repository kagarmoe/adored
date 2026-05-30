import type { User } from "@/types";
import type { IUserRepository } from "@/server/repositories/UserRepository";

export class UserService {
  constructor(private repo: IUserRepository) {}

  async getCurrentUser(userId: string): Promise<User | null> {
    return this.repo.findById(userId);
  }

  async updateProfile(
    userId: string,
    data: { name?: string; email?: string },
  ): Promise<User> {
    return this.repo.update(userId, {
      name: data.name,
      email: data.email,
      updatedAt: new Date(),
    });
  }

  async deleteAccount(userId: string): Promise<User> {
    return this.repo.softDelete(userId);
  }
}
