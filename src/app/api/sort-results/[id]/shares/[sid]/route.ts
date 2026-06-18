import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ShareController } from "@/server/api/shares";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; sid: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;
    const share = await new SortResultShareRepository(db).findById(params.sid);
    if (!share || share.sortResultId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(share);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
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
    const existing = await new SortResultShareRepository(db).findById(params.sid);
    if (!existing || existing.sortResultId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const shareRepo = new SortResultShareRepository(db);
    const controller = new ShareController(shareRepo);
    const share = await controller.updateShare(params.sid, body);
    return NextResponse.json(share);
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
  { params }: { params: { id: string; sid: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;
    const existing = await new SortResultShareRepository(db).findById(params.sid);
    if (!existing || existing.sortResultId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const shareRepo = new SortResultShareRepository(db);
    const controller = new ShareController(shareRepo);
    await controller.revokeShare(params.sid);
    return NextResponse.json({ message: "Share revoked" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
