import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
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
  const photoRepo = new PhotoRepository(db);

  try {
    const photo = await photoRepo.findById(params.photoId);
    // Only this collection's pooled (unassigned) photos are served here.
    if (!photo || photo.collectionId !== params.id || photo.itemId !== null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // items:read = curator — any curator may view pool photo files (full-curator model).
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
