import { eq, isNull, and, or, ne, exists } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { collectionsTable, membershipsTable } from "@/lib/db/schema";
import type { Collection } from "@/types";
import { slugifyName, RESERVED_COLLECTION_SLUGS } from "@/lib/collections/slug";

export class CollectionRepository {
  constructor(private db: Database) {}

  async create(data: {
    id: string;
    ownerId: string;
    name: string;
    description?: string;
  }): Promise<Collection> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = await this.generateUniqueSlug(data.name);
      try {
        const [collection] = await this.db
          .insert(collectionsTable)
          .values({
            id: data.id,
            ownerId: data.ownerId,
            name: data.name,
            slug,
            description: data.description || null,
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          })
          .returning();
        return this.mapToCollection(collection);
      } catch (error) {
        if (isSlugConflict(error) && attempt < 4) continue;
        throw error;
      }
    }
    throw new Error("Could not allocate a collection slug");
  }

  async findById(id: string): Promise<Collection | null> {
    const [collection] = await this.db
      .select()
      .from(collectionsTable)
      .where(and(eq(collectionsTable.id, id), isNull(collectionsTable.deletedAt)));
    return collection ? this.mapToCollection(collection) : null;
  }

  async findBySlug(slug: string): Promise<Collection | null> {
    const [collection] = await this.db
      .select()
      .from(collectionsTable)
      .where(and(eq(collectionsTable.slug, slug), isNull(collectionsTable.deletedAt)));
    return collection ? this.mapToCollection(collection) : null;
  }

  async findByOwner(ownerId: string): Promise<Collection[]> {
    const collections = await this.db
      .select()
      .from(collectionsTable)
      .where(and(eq(collectionsTable.ownerId, ownerId), isNull(collectionsTable.deletedAt)));
    return collections.map((c) => this.mapToCollection(c));
  }

  // Collections the user can see in their list: owned ∪ those where a membership
  // row exists for the user (a row is created ONLY on invitation-accept, so
  // "row exists" == "accepted member"). Deliberately does NOT read invitations:
  // a PENDING invite must not surface a collection the user never joined
  // (IDOR-by-list). One query via an EXISTS-membership OR ownerId predicate;
  // the (collection_id, user_id) unique index means each collection matches at
  // most once, but the caller may still own AND have a row for the same id, so
  // dedupe by id. Excludes soft-deleted, matching findByOwner.
  async findByOwnerOrMember(userId: string): Promise<Collection[]> {
    const rows = await this.db
      .select()
      .from(collectionsTable)
      .where(
        and(
          isNull(collectionsTable.deletedAt),
          or(
            eq(collectionsTable.ownerId, userId),
            exists(
              this.db
                .select({ one: membershipsTable.id })
                .from(membershipsTable)
                .where(
                  and(
                    eq(membershipsTable.collectionId, collectionsTable.id),
                    eq(membershipsTable.userId, userId),
                  ),
                ),
            ),
          ),
        ),
      );
    const byId = new Map<string, Collection>();
    for (const row of rows) {
      if (!byId.has(row.id)) byId.set(row.id, this.mapToCollection(row));
    }
    return [...byId.values()];
  }

  // Resolve EVERY collection owned by the user WITHOUT the deletedAt filter —
  // account deletion must purge a user's soft-deleted (archived) collections too,
  // which findByOwner (active-only) would skip. Mirrors findByIdIncludingDeleted.
  async findByOwnerIncludingDeleted(ownerId: string): Promise<Collection[]> {
    const collections = await this.db
      .select()
      .from(collectionsTable)
      .where(eq(collectionsTable.ownerId, ownerId));
    return collections.map((c) => this.mapToCollection(c));
  }

  async update(
    id: string,
    data: Partial<Omit<Collection, "id" | "createdAt" | "slug">>,
  ): Promise<Collection> {
    // Regenerate the slug when the name changes (excluding this row from dedupe).
    const renaming = data.name !== undefined;
    let newSlug = renaming ? await this.generateUniqueSlug(data.name!, id) : undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [collection] = await this.db
          .update(collectionsTable)
          .set({
            ...data,
            ...(newSlug !== undefined ? { slug: newSlug } : {}),
            updatedAt: new Date(),
          })
          .where(eq(collectionsTable.id, id))
          .returning();
        return this.mapToCollection(collection);
      } catch (error) {
        if (isSlugConflict(error) && renaming && attempt < 4) {
          // Lost the race; recompute against the now-current set and retry.
          newSlug = await this.generateUniqueSlug(data.name!, id);
          continue;
        }
        throw error;
      }
    }
    throw new Error("Could not allocate a collection slug");
  }

  async softDelete(id: string): Promise<Collection> {
    const [collection] = await this.db
      .update(collectionsTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(collectionsTable.id, id))
      .returning();
    return this.mapToCollection(collection);
  }

  // Resolve a collection WITHOUT the deletedAt filter — purge must find a
  // soft-deleted collection too (findById can't, so it can't be reused here).
  async findByIdIncludingDeleted(id: string): Promise<Collection | null> {
    const [collection] = await this.db
      .select()
      .from(collectionsTable)
      .where(eq(collectionsTable.id, id));
    return collection ? this.mapToCollection(collection) : null;
  }

  // Permanent DELETE (purge). Caller has already removed every FK-referencing
  // child (items, photos, sessions, results, memberships, invitations, …).
  async hardDelete(id: string): Promise<void> {
    await this.db.delete(collectionsTable).where(eq(collectionsTable.id, id));
  }

  /**
   * First free value among `base`, `base-2`, `base-3`, … where "free" means not
   * reserved and not present in ANY row (incl. soft-deleted, which still hold
   * their slug in the unique index) other than `excludeId` (the row being
   * renamed). Empty-slugifiable names get a random fallback base.
   */
  private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
    const base = slugifyName(name) || randomSlug();
    for (let n = 1; ; n++) {
      const candidate = n === 1 ? base : `${base}-${n}`;
      if (RESERVED_COLLECTION_SLUGS.has(candidate)) continue;
      const where = excludeId
        ? and(eq(collectionsTable.slug, candidate), ne(collectionsTable.id, excludeId))
        : eq(collectionsTable.slug, candidate);
      const [row] = await this.db
        .select({ id: collectionsTable.id })
        .from(collectionsTable)
        .where(where);
      if (!row) return candidate;
    }
  }

  private mapToCollection(row: any): Collection {
    return {
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      slug: row.slug ?? null,
      description: row.description,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}

/** Crockford-base32 (no I/L/O/U), lowercased, 6 chars. */
function randomSlug(): string {
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function isSlugConflict(error: unknown): boolean {
  // Retry ONLY the UNIQUE(slug) race — any other unique violation is a real bug
  // and must surface. Constraint name matches the Drizzle-generated index.
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : String(error);
  return code === "23505" && message.includes("collections_slug_unique");
}
