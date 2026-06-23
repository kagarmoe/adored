import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ItemController } from "@/server/api/items";
import { requireApiItemCapability } from "@/server/dal/collection-access";
import { ItemSoftDeleteService } from "@/server/services/ItemService";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    // items:read = curator. Default resolution (no includeDeleted) — soft-deleted → 404.
    const item = await requireApiItemCapability(db, params.id, user.id, "items:read");
    if (item instanceof NextResponse) return item;
    return NextResponse.json(item);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    // items:write = curator. Default resolution — soft-deleted → 404.
    const item = await requireApiItemCapability(db, params.id, user.id, "items:write");
    if (item instanceof NextResponse) return item;

    const body = await request.json();
    const updated = await ItemController.fromDb(db).updateItem(params.id, body);
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    // items:write = curator. Default resolution — soft-deleted → 404.
    const item = await requireApiItemCapability(db, params.id, user.id, "items:write");
    if (item instanceof NextResponse) return item;

    // Soft-delete + audit in ONE transaction via ItemSoftDeleteService: a
    // committed delete always has exactly one audit row (purses-wfgj).
    const deleted = await ItemSoftDeleteService.fromDb(db).softDeleteWithAudit(item, user.id);

    return NextResponse.json({ message: "Item deleted", item: deleted });
  } catch (error) {
    return errorResponse(error);
  }
}
