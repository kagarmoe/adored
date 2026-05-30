import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ResultItemController } from "@/server/api/result-items";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { getDb } from "@/lib/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string; rid: string } }
) {
  try {
    await requireAuth();
    const db = getDb();
    const itemRepo = new SortResultItemRepository(db);
    const controller = new ResultItemController(itemRepo);
    const item = await controller.resetResultItem(params.rid);
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
