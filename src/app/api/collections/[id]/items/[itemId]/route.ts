import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ItemController } from "@/server/api/items";
import { requireApiCapability } from "@/server/dal/collection-access";
import { errorResponse } from "@/server/api/http-errors";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  try {
    // Verify item belongs to collection (belongs-to-parent).
    const item = await ItemController.fromDb(db).getItem(params.itemId);
    if (!item || item.collectionId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // items:write = curator — any curator may edit metadata (full-curator model).
    const access = await requireApiCapability(db, params.id, session.user.id, "items:write");
    if (access instanceof NextResponse) return access;

    const body = await req.json();
    const updated = await ItemController.fromDb(db).updateItem(params.itemId, body);

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
