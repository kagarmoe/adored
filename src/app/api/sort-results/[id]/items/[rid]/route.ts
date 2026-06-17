import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ResultItemController } from "@/server/api/result-items";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
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
    const existing = await new SortResultItemRepository(db).findById(params.rid);
    if (!existing || existing.sortResultId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const itemRepo = new SortResultItemRepository(db);
    const controller = new ResultItemController(itemRepo);

    const item = await controller.updateResultItem(params.rid, body);
    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
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
    const existing = await new SortResultItemRepository(db).findById(params.rid);
    if (!existing || existing.sortResultId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const itemRepo = new SortResultItemRepository(db);
    const controller = new ResultItemController(itemRepo);
    // ponytail: controller.deleteResultItem() is a pre-existing no-op stub; this PR
    // only adds the authz guard. Real deletion tracked in the follow-up bead.
    await controller.deleteResultItem();
    return NextResponse.json({ message: "Item removed from result" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
