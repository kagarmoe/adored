import type { Database } from "@/lib/db";
import type { Photo } from "@/types";
import { photosTable } from "@/lib/db/schema";
import { eq, and, isNull, isNotNull, asc, inArray, sql } from "drizzle-orm";
import { generateId } from "@/lib/id";
import type { IPhotoRepository } from "@/server/repositories/PhotoRepository";

export class PhotoRepository implements IPhotoRepository {
  constructor(private db: Database) {}

  async create(
    data: Omit<Photo, "id" | "createdAt" | "updatedAt" | "deletedAt">
  ): Promise<Photo> {
    const id = generateId("photo");
    const now = new Date();

    const [photo] = await this.db
      .insert(photosTable)
      .values({
        id,
        itemId: data.itemId,
        collectionId: data.collectionId,
        blobKey: data.blobKey,
        filename: data.filename,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        uploadedBy: data.uploadedBy,
        isHero: data.isHero,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .returning();

    return this.mapToPhoto(photo);
  }

  async findById(id: string): Promise<Photo | null> {
    const photos = await this.db
      .select()
      .from(photosTable)
      .where(and(eq(photosTable.id, id), isNull(photosTable.deletedAt)));

    return photos.length > 0 ? this.mapToPhoto(photos[0]) : null;
  }

  async findByIds(collectionId: string, photoIds: string[]): Promise<Photo[]> {
    if (photoIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(photosTable)
      .where(
        and(
          eq(photosTable.collectionId, collectionId),
          inArray(photosTable.id, photoIds),
          isNull(photosTable.deletedAt),
        ),
      );
    return rows.map((r) => this.mapToPhoto(r));
  }

  async findByItem(itemId: string): Promise<Photo[]> {
    const photos = await this.db
      .select()
      .from(photosTable)
      .where(and(eq(photosTable.itemId, itemId), isNull(photosTable.deletedAt)));

    return photos.map((p) => this.mapToPhoto(p));
  }

  // Per-item cover photo for a batch of items, in a single query (avoids N+1
  // on the items-list page). Cover = the item's hero (is_hero=true) if it has
  // one, else its earliest (created_at asc) non-deleted photo. Items with no
  // photos are absent from the map.
  async findCoverPhotosByItemIds(itemIds: string[]): Promise<Map<string, Photo>> {
    const map = new Map<string, Photo>();
    if (itemIds.length === 0) return map;
    const rows = await this.db
      .select()
      .from(photosTable)
      .where(
        and(
          inArray(photosTable.itemId, itemIds),
          isNull(photosTable.deletedAt),
        ),
      )
      .orderBy(asc(photosTable.createdAt), asc(photosTable.id));
    // earliest-first (id breaks created_at ties so "earliest" is deterministic);
    // hero wins. Walk once: set the first photo seen per item (the earliest),
    // then let a hero override.
    for (const row of rows) {
      const photo = this.mapToPhoto(row);
      if (!photo.itemId) continue;
      const existing = map.get(photo.itemId);
      if (!existing) {
        map.set(photo.itemId, photo);
      } else if (photo.isHero && !existing.isHero) {
        map.set(photo.itemId, photo);
      }
    }
    return map;
  }

  // Per-collection cover photo for a batch of collections, in a single query
  // (avoids N+1 on the collections-home page). A collection's cover is a
  // representative ASSIGNED photo (item_id IS NOT NULL): its hero (is_hero=true)
  // if any, else the earliest (created_at asc) non-deleted assigned photo.
  // POOLED photos (item_id IS NULL) are excluded — they have no item-scoped asset
  // URL. Collections with no assigned photos are absent from the map.
  async findCoverPhotosByCollectionIds(collectionIds: string[]): Promise<Map<string, Photo>> {
    const map = new Map<string, Photo>();
    if (collectionIds.length === 0) return map;
    const rows = await this.db
      .select()
      .from(photosTable)
      .where(
        and(
          inArray(photosTable.collectionId, collectionIds),
          isNotNull(photosTable.itemId),
          isNull(photosTable.deletedAt),
        ),
      )
      .orderBy(asc(photosTable.createdAt), asc(photosTable.id));
    // earliest-first (id breaks created_at ties); a hero overrides. One
    // representative cover photo per collection.
    for (const row of rows) {
      const photo = this.mapToPhoto(row);
      const existing = map.get(photo.collectionId);
      if (!existing) {
        map.set(photo.collectionId, photo);
      } else if (photo.isHero && !existing.isHero) {
        map.set(photo.collectionId, photo);
      }
    }
    return map;
  }

  async findPoolByCollection(collectionId: string): Promise<Photo[]> {
    const photos = await this.db
      .select()
      .from(photosTable)
      .where(
        and(
          eq(photosTable.collectionId, collectionId),
          isNull(photosTable.itemId),
          isNull(photosTable.deletedAt),
        ),
      )
      .orderBy(asc(photosTable.createdAt));
    return photos.map((p) => this.mapToPhoto(p));
  }

  async update(id: string, data: Partial<Omit<Photo, "id" | "createdAt">>): Promise<Photo> {
    const now = new Date();

    const [photo] = await this.db
      .update(photosTable)
      .set({
        ...data,
        updatedAt: now,
      })
      .where(and(eq(photosTable.id, id), isNull(photosTable.deletedAt)))
      .returning();

    return this.mapToPhoto(photo);
  }

  async softDelete(id: string): Promise<Photo> {
    const now = new Date();
    const [photo] = await this.db
      .update(photosTable)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(photosTable.id, id))
      .returning();

    return this.mapToPhoto(photo);
  }

  async clearHeroPhotos(itemId: string): Promise<void> {
    const now = new Date();
    await this.db
      .update(photosTable)
      .set({
        isHero: false,
        updatedAt: now,
      })
      .where(and(eq(photosTable.itemId, itemId), eq(photosTable.isHero, true)));
  }

  async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  async setHero(photoId: string, itemId: string): Promise<Photo> {
    await this.clearHeroPhotos(itemId);
    return this.update(photoId, { isHero: true });
  }

  // Assigns the given pooled photos to an item and marks exactly one as hero,
  // in a single UPDATE. The WHERE clause is the IDOR / double-assign guard: it
  // matches only this collection's still-pooled, non-deleted rows, so a photo
  // from another collection, an already-grouped photo, or a deleted one can
  // never be captured. The caller compares the returned count to the requested
  // count and rejects on a mismatch (neon-http has no transaction to lean on).
  async assignPooledPhotosToItem(
    collectionId: string,
    photoIds: string[],
    itemId: string,
    heroPhotoId: string,
  ): Promise<number> {
    if (photoIds.length === 0) return 0;
    const now = new Date();
    const rows = await this.db
      .update(photosTable)
      .set({
        itemId,
        isHero: sql<boolean>`(${photosTable.id} = ${heroPhotoId})`,
        updatedAt: now,
      })
      .where(
        and(
          eq(photosTable.collectionId, collectionId),
          inArray(photosTable.id, photoIds),
          isNull(photosTable.itemId),
          isNull(photosTable.deletedAt),
        ),
      )
      .returning({ id: photosTable.id });
    return rows.length;
  }

  // How many of these ids are currently available pooled photos of this
  // collection (unassigned, not deleted). Used to reject a grouping conflict
  // BEFORE any item is created or any photo is assigned — neon-http has no
  // transaction, so a pre-check keeps a conflict from leaking a half-assigned
  // orphan item.
  async countAvailablePooled(collectionId: string, photoIds: string[]): Promise<number> {
    if (photoIds.length === 0) return 0;
    const rows = await this.db
      .select({ id: photosTable.id })
      .from(photosTable)
      .where(
        and(
          eq(photosTable.collectionId, collectionId),
          inArray(photosTable.id, photoIds),
          isNull(photosTable.itemId),
          isNull(photosTable.deletedAt),
        ),
      );
    return rows.length;
  }

  // Reassign photos to a destination item (or NULL for the pool) and set hero:
  // the heroPhotoId becomes is_hero=true, everything else moved is_hero=false.
  // Used by the unified "Move to…" (move / split / return-to-pool).
  async reassignPhotos(
    collectionId: string,
    photoIds: string[],
    targetItemId: string | null,
    heroPhotoId: string | null,
  ): Promise<number> {
    if (photoIds.length === 0) return 0;
    const rows = await this.db
      .update(photosTable)
      .set({
        itemId: targetItemId,
        isHero: heroPhotoId
          ? sql<boolean>`(${photosTable.id} = ${heroPhotoId})`
          : sql<boolean>`false`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(photosTable.collectionId, collectionId),
          inArray(photosTable.id, photoIds),
          isNull(photosTable.deletedAt),
        ),
      )
      .returning({ id: photosTable.id });
    return rows.length;
  }

  // Return every photo of an item to the pool (item_id NULL, hero cleared).
  // Used to compensate a race-lost grouping so no photo is left pointing at a
  // soft-deleted item.
  async unassignAllFromItem(itemId: string): Promise<number> {
    const rows = await this.db
      .update(photosTable)
      .set({ itemId: null, isHero: false, updatedAt: new Date() })
      .where(and(eq(photosTable.itemId, itemId), isNull(photosTable.deletedAt)))
      .returning({ id: photosTable.id });
    return rows.length;
  }

  // Permanently DELETE every photo of an item (active AND soft-deleted — no
  // deletedAt filter), returning each row's blob_key so the caller can purge the
  // backing blobs. Purge-only; the item is being hard-deleted, so all its photos
  // must go regardless of soft-delete state.
  async hardDeleteByItem(itemId: string): Promise<string[]> {
    const rows = await this.db
      .delete(photosTable)
      .where(eq(photosTable.itemId, itemId))
      .returning({ blobKey: photosTable.blobKey });
    return rows.map((r) => r.blobKey);
  }

  private mapToPhoto(row: any): Photo {
    return {
      id: row.id,
      itemId: row.itemId,
      collectionId: row.collectionId,
      blobKey: row.blobKey,
      filename: row.filename,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      uploadedBy: row.uploadedBy,
      isHero: row.isHero,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}
