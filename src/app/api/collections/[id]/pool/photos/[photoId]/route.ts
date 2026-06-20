import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { ALLOWED_ROTATIONS } from "@/lib/photos";

// Rotate a POOLED (unassigned) photo. Same write-tier authz as the item rotate;
// the 3-conjunct guard keeps this endpoint scoped to this collection's pool.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; photoId: string } }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const photoRepo = new PhotoRepository(db);
  const membershipRepo = new MembershipRepository(db);
  const collectionRepo = new CollectionRepository(db);

  try {
    const photo = await photoRepo.findById(params.photoId);
    if (!photo || photo.collectionId !== params.id || photo.itemId !== null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await membershipRepo.findByUser(session.user.id, params.id);
    const collection = await collectionRepo.findById(params.id);
    const isOwner = collection?.ownerId === session.user.id;
    if ((!membership || !membership.canAddPhotos) && !isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let rotation: unknown;
    try {
      ({ rotation } = await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    if (!(ALLOWED_ROTATIONS as readonly unknown[]).includes(rotation)) {
      return NextResponse.json({ error: "Invalid rotation" }, { status: 400 });
    }

    const updated = await photoRepo.update(params.photoId, { rotation: rotation as number });
    return NextResponse.json({ rotation: updated.rotation, updatedAt: updated.updatedAt });
  } catch {
    return NextResponse.json({ error: "Rotate failed" }, { status: 500 });
  }
}
