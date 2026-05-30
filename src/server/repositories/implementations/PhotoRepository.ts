import type { Database } from "@/lib/db";
import type { Photo } from "@/types";
import { photosTable } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
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

  async findByItem(itemId: string): Promise<Photo[]> {
    const photos = await this.db
      .select()
      .from(photosTable)
      .where(and(eq(photosTable.itemId, itemId), isNull(photosTable.deletedAt)));

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
      .where(eq(photosTable.id, id))
      .returning();

    return this.mapToPhoto(photo);
  }

  async softDelete(id: string): Promise<void> {
    const now = new Date();
    await this.db
      .update(photosTable)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(photosTable.id, id));
  }

  private mapToPhoto(row: any): Photo {
    return {
      id: row.id,
      itemId: row.itemId,
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
