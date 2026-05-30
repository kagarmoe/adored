import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { usersTable } from "@/lib/db/schema";
import type { IUserRepository } from "../UserRepository";
import type { User } from "@/types";

export class UserRepository implements IUserRepository {
  constructor(private db: Database) {}

  async create(data: { id: string; email: string; name?: string }): Promise<User> {
    const [user] = await this.db
      .insert(usersTable)
      .values({
        id: data.id,
        email: data.email,
        name: data.name || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      })
      .returning();
    return this.mapToUser(user);
  }

  async findById(id: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id));
    return user ? this.mapToUser(user) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));
    return user ? this.mapToUser(user) : null;
  }

  async update(
    id: string,
    data: Partial<Omit<User, "id" | "createdAt" | "deletedAt">>,
  ): Promise<User> {
    const [user] = await this.db
      .update(usersTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, id))
      .returning();
    return this.mapToUser(user);
  }

  async softDelete(id: string): Promise<User> {
    const [user] = await this.db
      .update(usersTable)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, id))
      .returning();
    return this.mapToUser(user);
  }

  private mapToUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}
