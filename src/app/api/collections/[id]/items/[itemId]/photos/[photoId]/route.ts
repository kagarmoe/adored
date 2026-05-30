import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { del } from "@vercel/blob";

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
    if (!membership || !membership.canDeletePhotos) {
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
