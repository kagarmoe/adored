import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ResultItemController } from "@/server/api/result-items";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; rid: string } }
) {
  try {
    await requireAuth();
    const db = getDb();
    const itemRepo = new SortResultItemRepository(db);
    const controller = new ResultItemController(itemRepo);
    const item = await controller.getResultItem(params.rid);
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
    await requireAuth();
    const body = await request.json();
    const db = getDb();
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
  _request: NextRequest
) {
  try {
    await requireAuth();
    const db = getDb();
    const itemRepo = new SortResultItemRepository(db);
    const controller = new ResultItemController(itemRepo);
    await controller.deleteResultItem();
    return NextResponse.json({ message: "Item removed from result" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
