import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { servePhotoFile } from "@/lib/photo-serving";
import { ItemController } from "@/server/api/items";
import { PhotoController } from "@/server/api/photos";
import { requireApiCapability } from "@/server/dal/collection-access";

export interface ItemPhotoFileParams {
  id: string;
  itemId: string;
  photoId: string;
}

export async function serveItemPhotoFile(
  request: NextRequest,
  params: Promise<ItemPhotoFileParams>,
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  try {
    const { id, itemId, photoId } = await params;
    // Authz BEFORE existence (purses-ct0): the collection is known from the URL, so a
    // caller with no access is turned away without ever learning whether the item or
    // photo exists. Resolving first would leak that (404 "not here" vs 403 "here, but
    // not yours") — an existence oracle for a non-member.
    // items:read = curator — any curator may view photo files (full-curator model).
    const access = await requireApiCapability(db, id, session.user.id, "items:read");
    if (access instanceof NextResponse) return access;

    const item = await ItemController.fromDb(db).getItem(itemId);
    if (!item || item.collectionId !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const photo = await PhotoController.fromDb(db).findById(photoId);
    if (!photo || photo.itemId !== itemId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return servePhotoFile(
      {
        blobKey: photo.blobKey,
        mimeType: photo.mimeType,
        photoId: photo.id,
        collectionId: id,
        updatedAt: photo.updatedAt,
        rotation: photo.rotation,
      },
      request,
    );
  } catch {
    return NextResponse.json({ error: "Photo fetch failed" }, { status: 500 });
  }
}
