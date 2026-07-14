import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { CollectionController } from "@/server/api/collections";
import { MemberController } from "@/server/api/members";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";
import { withTransaction } from "@/lib/transactions";

export async function GET() {
  try {
    const user = await requireAuth();
    const db = getDb();
    const collections = await CollectionController.fromDb(db).listCollections(user.id);
    return NextResponse.json(collections);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const db = getDb();
    const collection = await withTransaction(db, async (tx) => {
      const col = await CollectionController.fromDb(tx).createCollection(user.id, body);
      await MemberController.fromDb(tx).addOwner(col.id, user.id);
      return col;
    });
    return NextResponse.json(collection, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
