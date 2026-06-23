import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ItemController } from "@/server/api/items";
import { requireApiCapability } from "@/server/dal/collection-access";
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
    // items:write = curator — any curator may create items (full-curator model).
    const access = await requireApiCapability(db, collectionId, user.id, "items:write");
    if (access instanceof NextResponse) return access;

    const body = await request.json();
    const item = await ItemController.fromDb(db).createItem(collectionId, body);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
