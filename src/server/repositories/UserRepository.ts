import type { User } from "@/types";

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: { email: string; name?: string }): Promise<User>;
  update(id: string, data: Partial<Omit<User, "id" | "createdAt">>): Promise<User>;
  softDelete(id: string): Promise<User>;
}
