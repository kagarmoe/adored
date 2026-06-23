import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { CollectionController } from "@/server/api/collections";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCollectionAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;

    const collectionRepo = new CollectionRepository(db);
    const controller = new CollectionController(collectionRepo);

    const collection = await controller.getCollection(params.id);
    return NextResponse.json(collection);
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
    const body = await request.json();

    const db = getDb();
    const collectionRepo = new CollectionRepository(db);
    const controller = new CollectionController(collectionRepo);

    // Check if user can manage collection
    const canManage = await controller.canManageCollection(user.id, params.id);
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const collection = await controller.updateCollection(params.id, body);
    return NextResponse.json(collection);
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
    const collectionRepo = new CollectionRepository(db);
    const controller = new CollectionController(collectionRepo);

    // Only owner can delete
    const isOwner = await controller.isOwner(user.id, params.id);
    if (!isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const collection = await controller.deleteCollection(params.id);
    return NextResponse.json({ message: "Collection deleted", collection });
  } catch (error) {
    return errorResponse(error);
  }
}
