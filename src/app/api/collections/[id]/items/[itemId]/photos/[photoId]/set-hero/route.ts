import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCapability } from "@/server/dal/collection-access";
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

  // photos:write = curator — any curator may set hero (full-curator model).
  const access = await requireApiCapability(db, params.id, session.user.id, "photos:write");
  if (access instanceof NextResponse) return access;

  try {
    await photoRepo.setHero(params.photoId, params.itemId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Set hero failed" }, { status: 400 });
  }
}
