import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { CollectionController } from "@/server/api/collections";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { getDb } from "@/lib/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const collectionRepo = new CollectionRepository(db);
    const controller = new CollectionController(collectionRepo);

    // Resolve first so an absent collection is a 404, not a 403 from the
    // canManageCollection(findById→null→false) path (purses-nj7 ride-along).
    // Use findById (matching archive): restore flips status archived→active, so a
    // soft-deleted collection is "absent" from the active-management view → 404, not 403.
    const existing = await collectionRepo.findById(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Check if user can manage collection
    const canManage = await controller.canManageCollection(user.id, params.id);
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const collection = await controller.restoreCollection(params.id);
    return NextResponse.json(collection);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
