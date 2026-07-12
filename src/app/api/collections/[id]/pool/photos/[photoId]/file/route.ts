import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoController } from "@/server/api/photos";
import { requireApiCapability } from "@/server/dal/collection-access";
import { servePhotoFile } from "@/lib/photo-serving";

// sharp (used by servePhotoFile) is a native addon — pin the Node runtime.
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; photoId: string } },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  try {
    // Authz BEFORE existence (purses-ct0) — see the item /file route for the rationale:
    // resolving the photo first would let a non-member distinguish 404 from 403.
    // items:read = curator — any curator may view pool photo files (full-curator model).
    const access = await requireApiCapability(db, params.id, session.user.id, "items:read");
    if (access instanceof NextResponse) return access;

    const photo = await PhotoController.fromDb(db).findById(params.photoId);
    // Only this collection's pooled (unassigned) photos are served here.
    if (!photo || photo.collectionId !== params.id || photo.itemId !== null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

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
