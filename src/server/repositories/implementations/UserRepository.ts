import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { user } from "@/lib/db/schema";
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
