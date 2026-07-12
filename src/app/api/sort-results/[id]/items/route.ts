import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ResultItemController } from "@/server/api/result-items";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;
    const items = await ResultItemController.fromDb(db).listResultItems(id);
    return NextResponse.json(items);
  } catch (error) {
    return errorResponse(error);
  }
}

// Epic S S3a: transactional bulk re-rank. Body `{ order: [{ rid, manualRank }] }`
// applied in ONE transaction (one drag = one atomic call). Same gate ladder as the
// per-item route: auth → curator access → 409 if finalized. rid-membership is
// enforced inside the service tx — a bad/foreign rid rolls the whole batch back → 404.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const body = await request.json();
    const db = getDb();
    const access = await requireApiResultAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;
    if (access.status === "finalized") {
      return NextResponse.json({ error: "Result is finalized" }, { status: 409 });
    }
    const items = await ResultItemController.fromDb(db).reorderResultItems(id, body);
    return NextResponse.json(items);
  } catch (error) {
    return errorResponse(error);
  }
}

// Epic S S3a: whole-list reset — NULL every item's manual overlay (back to the
// computed order). Draft-only (409 finalized), curator-scoped.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;
    if (access.status === "finalized") {
      return NextResponse.json({ error: "Result is finalized" }, { status: 409 });
    }
    const items = await ResultItemController.fromDb(db).resetResultItems(id);
    return NextResponse.json(items);
  } catch (error) {
    return errorResponse(error);
  }
}
