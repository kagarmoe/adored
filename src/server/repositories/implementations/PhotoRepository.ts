import type { Database } from "@/lib/db";
import type { Photo } from "@/types";
import { photosTable } from "@/lib/db/schema";
import { eq, and, isNull, isNotNull, asc, inArray, sql } from "drizzle-orm";
import { generateId } from "@/lib/id";
import type { IPhotoRepository } from "@/server/repositories/PhotoRepository";

export class PhotoRepository implements IPhotoRepository {
  constructor(private db: Database) {}

  async create(
    // rotation is optional at the create boundary (DB default 0) so existing
    // callers that don't set it keep compiling.
    data: Omit<Photo, "id" | "createdAt" | "updatedAt" | "deletedAt" | "rotation"> & {
      rotation?: number;
    }
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
        rotation: data.rotation ?? 0,
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

  // Which of the GIVEN collections hold at least one pooled photo (item_id IS
  // NULL, deleted_at IS NULL). Powers the /collections "Photos waiting" cue.
  //
  // BOUNDED by construction: SELECT DISTINCT collection_id returns at most one row
  // per input id — never photo rows, no global pool, no unbounded scan. The
  // existing photos_collection_id_idx backs the inArray filter.
  //
  // NOT an access boundary. Like findCoverPhotosByCollectionIds, the bare
  // inArray trusts its input: callers MUST pass ONLY the authenticated user's
  // already-access-filtered collection ids (the /collections page derives them
  // from CollectionController.listCollections(userId)). Never hand it raw/client
  // ids or it would expose other users' pool state.
  async findCollectionIdsWithPooledPhotos(collectionIds: string[]): Promise<Set<string>> {
    if (collectionIds.length === 0) return new Set();
    const rows = await this.db
      .selectDistinct({ collectionId: photosTable.collectionId })
      .from(photosTable)
      .where(
        and(
          inArray(photosTable.collectionId, collectionIds),
          isNull(photosTable.itemId),
          isNull(photosTable.deletedAt),
        ),
      );
    return new Set(rows.map((r) => r.collectionId));
  }

  // Loose (un-grouped) photos of a collection, oldest first. `limit` bounds the
  // read at the SQL layer for the workspace preview (findPoolByCollection(id, 6));
  // existing callers omit it and get the full pool. Order is created_at ASC, id ASC:
  // `created_at` matches /pool's oldest-first order; `id` breaks created_at ties so a
  // LIMIT cut is deterministic. Never order by updated_at — rotation bumps it.
  //
  // Index/EXPLAIN decision (verified on the test DB, 5000-row photos): NO new
  // index is needed. For a selective collection the planner uses the existing
  // photos_collection_id_idx (Index Scan, cost ~8). Worst case — one collection
  // holding the whole table — it Seq Scans, but the LIMIT turns the sort into a
  // bounded top-N heapsort (~26kB, cost ~223) that is roughly half the cost of
  // today's *accepted* unbounded pool read (full quicksort, ~732kB, cost ~440).
  // So the bounded preview is strictly cheaper than the read it slices.
  async findPoolByCollection(collectionId: string, limit?: number): Promise<Photo[]> {
    const base = this.db
      .select()
      .from(photosTable)
      .where(
        and(
          eq(photosTable.collectionId, collectionId),
          isNull(photosTable.itemId),
          isNull(photosTable.deletedAt),
        ),
      )
      .orderBy(asc(photosTable.createdAt), asc(photosTable.id));
    const photos = limit === undefined ? await base : await base.limit(limit);
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
  // count and rejects on a mismatch — a single guarded UPDATE needs no transaction.
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
  // BEFORE any item is created or any photo is assigned — the create→assign path
  // is deliberately non-transactional, so a pre-check keeps a conflict from leaking
  // a half-assigned orphan item (partial failure is at worst a harmless empty item).
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

  // Permanently DELETE every photo of the collection (active AND soft-deleted,
  // assigned AND pooled — no deletedAt/itemId filter), returning each row's
  // blob_key so the caller can purge the backing blobs. Purge-only.
  async hardDeleteByCollection(collectionId: string): Promise<string[]> {
    const rows = await this.db
      .delete(photosTable)
      .where(eq(photosTable.collectionId, collectionId))
      .returning({ blobKey: photosTable.blobKey });
    return rows.map((r) => r.blobKey);
  }

  // Scrub the uploader identifier (NOT delete the row). Used during account
  // deletion for photos the user contributed into OTHER owners' collections:
  // the photo is shared content that must survive, but its uploaded_by must no
  // longer link back to the deleted user. Returns the affected-row count.
  async scrubUploader(userId: string, tombstone: string): Promise<number> {
    const rows = await this.db
      .update(photosTable)
      .set({ uploadedBy: tombstone, updatedAt: new Date() })
      .where(eq(photosTable.uploadedBy, userId))
      .returning({ id: photosTable.id });
    return rows.length;
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
      rotation: row.rotation,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}
