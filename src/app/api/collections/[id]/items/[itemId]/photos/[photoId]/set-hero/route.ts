import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCapability } from "@/server/dal/collection-access";
import { ItemController } from "@/server/api/items";
import { PhotoController } from "@/server/api/photos";
import { errorResponse } from "@/server/api/http-errors";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; photoId: string }> }
) {
  const { id, itemId, photoId } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();

  // Authz before existence (purses-ct0): the collection is in the URL, so a
  // non-curator never learns whether the item/photo exists.
  // photos:write = curator — any curator may set hero (full-curator model).
  const access = await requireApiCapability(db, id, session.user.id, "photos:write");
  if (access instanceof NextResponse) return access;

  const item = await ItemController.fromDb(db).getItem(itemId);
  if (!item || item.collectionId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const photoCtrl = PhotoController.fromDb(db);
  const photo = await photoCtrl.findById(photoId);
  if (!photo || photo.itemId !== itemId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await photoCtrl.setHero(photoId, itemId);
    return NextResponse.json({ success: true });
  } catch (error) {
    // Expected failures return explicitly above; anything here is unexpected and its
    // message carries driver text — errorResponse logs it, returns generic (purses-hiez).
    return errorResponse(error);
  }
}
