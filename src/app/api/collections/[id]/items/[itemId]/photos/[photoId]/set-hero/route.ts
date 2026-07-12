import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCapability } from "@/server/dal/collection-access";
import { ItemController } from "@/server/api/items";
import { PhotoController } from "@/server/api/photos";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; itemId: string; photoId: string } }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();

  // Authz before existence (purses-ct0): the collection is in the URL, so a
  // non-curator never learns whether the item/photo exists.
  // photos:write = curator — any curator may set hero (full-curator model).
  const access = await requireApiCapability(db, params.id, session.user.id, "photos:write");
  if (access instanceof NextResponse) return access;

  const item = await ItemController.fromDb(db).getItem(params.itemId);
  if (!item || item.collectionId !== params.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const photoCtrl = PhotoController.fromDb(db);
  const photo = await photoCtrl.findById(params.photoId);
  if (!photo || photo.itemId !== params.itemId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await photoCtrl.setHero(params.photoId, params.itemId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Set hero failed" }, { status: 400 });
  }
}
