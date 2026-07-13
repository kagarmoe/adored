import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { CollectionController } from "@/server/api/collections";
import { requireApiCapability, requireApiCollectionAccess } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCollectionAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;

    const collection = await CollectionController.fromDb(db).getCollection(id);
    return NextResponse.json(collection);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCapability(db, id, user.id, "collection:manage");
    if (access instanceof NextResponse) return access;

    const body = await request.json();
    const collection = await CollectionController.fromDb(db).updateCollection(id, body);
    return NextResponse.json(collection);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCapability(db, id, user.id, "collection:manage");
    if (access instanceof NextResponse) return access;

    const collection = await CollectionController.fromDb(db).deleteCollection(id);
    return NextResponse.json({ message: "Collection deleted", collection });
  } catch (error) {
    return errorResponse(error);
  }
}
