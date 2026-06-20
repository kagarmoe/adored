import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { del } from "@vercel/blob";
import { ALLOWED_ROTATIONS } from "@/lib/photos";

// Rotate a photo (persisted, non-destructive). Authz is a WRITE tier
// (canAddPhotos|owner), not the bare-member read tier — a view-only curator must
// not silently re-orient shared photos. Resource existence (404) is fully
// resolved before the permission check (403), and validation (400) only after
// authz, so update never runs on a rejected request.
export async function PATCH(
  req: NextRequest,
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

export async function DELETE(
  _req: NextRequest,
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
    // Verify item belongs to collection and user has permission
    const item = await itemRepo.findById(params.itemId);
    if (!item || item.collectionId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await membershipRepo.findByUser(
      session.user.id,
      params.id
    );
    const collection = await collectionRepo.findById(params.id);
    const isOwner = collection?.ownerId === session.user.id;
    if ((!membership || !membership.canDeletePhotos) && !isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get photo to find blob URL
    const photo = await photoRepo.findById(params.photoId);
    if (!photo || photo.itemId !== params.itemId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (photo.blobKey.startsWith("http")) {
      // Delete from blob storage if it's a URL
      await del(photo.blobKey);
    }

    // Delete from database
    await photoRepo.delete(params.photoId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 400 }
    );
  }
}
