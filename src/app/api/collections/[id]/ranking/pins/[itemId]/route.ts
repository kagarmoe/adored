import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { RankingController } from "@/server/api/ranking";
import { errorResponse } from "@/server/api/http-errors";

type Params = { params: Promise<{ id: string; itemId: string }> };

// Hand-place one piece in the live ranking (spec §4 "Adjusting"). The first pin
// lazily opens the curator's one draft; later pins reuse it. Authz before body.
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id, itemId } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCollectionAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;
    const body: unknown = await request.json();
    await RankingController.fromDb(db).pin(access.id, user.id, itemId, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

// Unpin: the piece goes back to its derived place. Idempotent.
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id, itemId } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCollectionAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;
    await RankingController.fromDb(db).unpin(access.id, user.id, itemId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
