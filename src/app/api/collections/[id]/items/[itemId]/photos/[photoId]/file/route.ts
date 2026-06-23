import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { requireApiCapability } from "@/server/dal/collection-access";
import { servePhotoFile } from "@/lib/photo-serving";

// sharp (used by servePhotoFile) is a native addon — pin the Node runtime.
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string; photoId: string } }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const photoRepo = new PhotoRepository(db);
  const itemRepo = new ItemRepository(db);

  try {
    const item = await itemRepo.findById(params.itemId);
    if (!item || item.collectionId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const photo = await photoRepo.findById(params.photoId);
    if (!photo || photo.itemId !== params.itemId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // items:read = curator — any curator may view photo files (full-curator model).
    const access = await requireApiCapability(db, params.id, session.user.id, "items:read");
    if (access instanceof NextResponse) return access;

    return servePhotoFile(
      {
        blobKey: photo.blobKey,
        mimeType: photo.mimeType,
        photoId: photo.id,
        collectionId: params.id,
        updatedAt: photo.updatedAt,
        rotation: photo.rotation,
      },
      request
    );
  } catch {
    return NextResponse.json({ error: "Photo fetch failed" }, { status: 500 });
  }
}
