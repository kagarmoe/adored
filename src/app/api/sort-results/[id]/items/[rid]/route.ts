import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ResultItemController } from "@/server/api/result-items";
import { SortResultService } from "@/server/services/SortResultService";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; rid: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;
    const item = await new SortResultItemRepository(db).findById(params.rid);
    if (!item || item.sortResultId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; rid: string } }
) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const db = getDb();
    const access = await requireApiResultAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;
    if (access.status === "finalized") {
      return NextResponse.json(
        { error: "Result is finalized" },
        { status: 409 },
      );
    }
    const existing = await new SortResultItemRepository(db).findById(params.rid);
    if (!existing || existing.sortResultId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const itemRepo = new SortResultItemRepository(db);
    const controller = new ResultItemController(itemRepo);

    const item = await controller.updateResultItem(params.rid, body);
    return NextResponse.json(item);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; rid: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;
    if (access.status === "finalized") {
      return NextResponse.json(
        { error: "Result is finalized" },
        { status: 409 },
      );
    }
    const existing = await new SortResultItemRepository(db).findById(params.rid);
    if (!existing || existing.sortResultId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const service = new SortResultService(
      new SortResultRepository(db),
      new SortResultItemRepository(db),
      new CollectionPreferenceItemRepository(db),
      db,
    );
    await service.deleteResultItem(params.rid);
    return NextResponse.json({ message: "Item removed from result" });
  } catch (error) {
    return errorResponse(error);
  }
}
