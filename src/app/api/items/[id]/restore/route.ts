import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ItemController } from "@/server/api/items";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { requireApiItemCapability } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    // items:write = curator. includeDeleted: true — the item to restore IS soft-deleted.
    const item = await requireApiItemCapability(db, params.id, user.id, "items:write", { includeDeleted: true });
    if (item instanceof NextResponse) return item;

    const controller = new ItemController(new ItemRepository(db));
    const restored = await controller.restoreItem(params.id);
    return NextResponse.json(restored);
  } catch (error) {
    return errorResponse(error);
  }
}
