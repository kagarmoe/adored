import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ResultItemController } from "@/server/api/result-items";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string; rid: string } },
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
    const item = await controller.resetResultItem(params.rid);
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 },
    );
  }
}
