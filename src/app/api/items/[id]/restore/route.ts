import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ItemController } from "@/server/api/items";
import { requireApiItemCapability } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    // items:write = curator. includeDeleted: true — the item to restore IS soft-deleted.
    const item = await requireApiItemCapability(db, id, user.id, "items:write", { includeDeleted: true });
    if (item instanceof NextResponse) return item;

    const restored = await ItemController.fromDb(db).restoreItem(id);
    return NextResponse.json(restored);
  } catch (error) {
    return errorResponse(error);
  }
}
