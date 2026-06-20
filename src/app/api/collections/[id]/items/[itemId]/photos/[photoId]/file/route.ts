import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
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
  const membershipRepo = new MembershipRepository(db);
  const collectionRepo = new CollectionRepository(db);

  try {
    const item = await itemRepo.findById(params.itemId);
    if (!item || item.collectionId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const photo = await photoRepo.findById(params.photoId);
    if (!photo || photo.itemId !== params.itemId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await membershipRepo.findByUser(session.user.id, params.id);
    const collection = await collectionRepo.findById(params.id);
    const isOwner = collection?.ownerId === session.user.id;
    if (!membership && !isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return servePhotoFile(
      {
        blobKey: photo.blobKey,
        mimeType: photo.mimeType,
        photoId: photo.id,
        updatedAt: photo.updatedAt,
        rotation: photo.rotation,
      },
      request
    );
  } catch {
    return NextResponse.json({ error: "Photo fetch failed" }, { status: 500 });
  }
}
