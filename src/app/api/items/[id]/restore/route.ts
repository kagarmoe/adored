import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ItemController } from "@/server/api/items";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const itemRepo = new ItemRepository(db);

    // Lifecycle op: resolve INCLUDING soft-deleted (the item to restore is deleted).
    const existing = await itemRepo.findByIdIncludingDeleted(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const access = await requireApiCollectionAccess(db, existing.collectionId, user.id);
    if (access instanceof NextResponse) return access;

    const controller = new ItemController(itemRepo);
    const item = await controller.restoreItem(params.id);
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
