import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ItemController } from "@/server/api/items";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const itemRepo = new ItemRepository(db);

    const item = await itemRepo.findById(params.id);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const access = await requireApiCollectionAccess(db, item.collectionId, user.id);
    if (access instanceof NextResponse) return access;

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
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const itemRepo = new ItemRepository(db);

    const existing = await itemRepo.findById(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const access = await requireApiCollectionAccess(db, existing.collectionId, user.id);
    if (access instanceof NextResponse) return access;

    const body = await request.json();
    const controller = new ItemController(itemRepo);
    const item = await controller.updateItem(params.id, body);
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
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const itemRepo = new ItemRepository(db);

    const existing = await itemRepo.findById(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const access = await requireApiCollectionAccess(db, existing.collectionId, user.id);
    if (access instanceof NextResponse) return access;

    const controller = new ItemController(itemRepo);
    const item = await controller.deleteItem(params.id);
    return NextResponse.json({ message: "Item deleted", item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
