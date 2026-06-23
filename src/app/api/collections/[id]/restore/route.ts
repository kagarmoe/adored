import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { CollectionController } from "@/server/api/collections";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { requireApiCapability } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    // requireApiCapability resolves-then-authorizes: 404 absent, 403 not owner.
    const access = await requireApiCapability(db, params.id, user.id, "collection:manage");
    if (access instanceof NextResponse) return access;

    const collection = await new CollectionController(new CollectionRepository(db)).restoreCollection(params.id);
    return NextResponse.json(collection);
  } catch (error) {
    return errorResponse(error);
  }
}
