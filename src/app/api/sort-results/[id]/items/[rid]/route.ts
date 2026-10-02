import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ResultItemController } from "@/server/api/result-items";
import { SortResultService } from "@/server/services/SortResultService";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; rid: string }> }
) {
  try {
    const { id, rid } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;
    const item = await ResultItemController.fromDb(db).getByIdForResult(rid, id);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; rid: string }> }
) {
  try {
    const { id, rid } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;
    if (access.status === "finalized") {
      return NextResponse.json(
        { error: "Result is finalized" },
        { status: 409 },
      );
    }
    const existing = await ResultItemController.fromDb(db).getByIdForResult(rid, id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await SortResultService.fromDb(db).deleteResultItem(rid);
    return NextResponse.json({ message: "Item removed from result" });
  } catch (error) {
    return errorResponse(error);
  }
}
