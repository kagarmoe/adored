import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; itemId: string; photoId: string } }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const item = await new ItemRepository(db).findById(params.itemId);
  if (!item || item.collectionId !== params.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const photoRepo = new PhotoRepository(db);
  const photo = await photoRepo.findById(params.photoId);
  if (!photo || photo.itemId !== params.itemId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const access = await requireApiCollectionAccess(db, params.id, session.user.id);
  if (access instanceof NextResponse) return access;

  try {
    await photoRepo.setHero(params.photoId, params.itemId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Set hero failed" }, { status: 400 });
  }
}
