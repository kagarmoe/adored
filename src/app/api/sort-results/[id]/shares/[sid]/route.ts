import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ShareController } from "@/server/api/shares";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; sid: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;
    const share = await ShareController.fromDb(db).getByIdForResult(params.sid, params.id);
    if (!share) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(share);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; sid: string } }
) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const db = getDb();
    const access = await requireApiResultAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;
    const ctrl = ShareController.fromDb(db);
    const existing = await ctrl.getByIdForResult(params.sid, params.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const share = await ctrl.updateShare(params.sid, body);
    return NextResponse.json(share);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; sid: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;
    const ctrl = ShareController.fromDb(db);
    const existing = await ctrl.getByIdForResult(params.sid, params.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await ctrl.revokeShare(params.sid);
    return NextResponse.json({ message: "Share revoked" });
  } catch (error) {
    return errorResponse(error);
  }
}
