import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ItemController } from "@/server/api/items";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { requireApiItemCapability } from "@/server/dal/collection-access";
import { AuditLogRepository } from "@/server/repositories/implementations/AuditLogRepository";
import { withTransaction } from "@/lib/transactions";
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
    const controller = new ItemController(new ItemRepository(db));
    const updated = await controller.updateItem(params.id, body);
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

    // Soft-delete + audit in ONE transaction (mirrors ItemPurgeService): a
    // committed delete always has exactly one audit row — if the audit insert
    // throws, the soft-delete rolls back, so an item is never deleted without
    // attribution (purses-wfgj). Both writes are single UPDATEs/INSERTs.
    const deleted = await withTransaction(db, async (tx) => {
      const row = await new ItemRepository(tx).softDelete(item.id);
      await new AuditLogRepository(tx).record({
        actorId: user.id,
        action: "item.delete",
        targetType: "item",
        targetId: item.id,
        collectionId: item.collectionId,
      });
      return row;
    });

    return NextResponse.json({ message: "Item deleted", item: deleted });
  } catch (error) {
    return errorResponse(error);
  }
}
