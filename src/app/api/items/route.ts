import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ItemController } from "@/server/api/items";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const searchParams = request.nextUrl.searchParams;
    const collectionId = searchParams.get("collectionId");

    if (!collectionId) {
      return NextResponse.json(
        { error: "collectionId is required" },
        { status: 400 }
      );
    }

    const db = getDb();
    const access = await requireApiCollectionAccess(db, collectionId, user.id);
    if (access instanceof NextResponse) return access;

    const body = await request.json();
    const itemRepo = new ItemRepository(db);
    const controller = new ItemController(itemRepo);

    const item = await controller.createItem(collectionId, body);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
