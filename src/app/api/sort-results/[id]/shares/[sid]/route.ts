import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ShareController } from "@/server/api/shares";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; sid: string } }
) {
  try {
    await requireAuth();
    const db = getDb();
    const shareRepo = new SortResultShareRepository(db);
    const controller = new ShareController(shareRepo);
    const share = await controller.getShare(params.sid);
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
    await requireAuth();
    const body = await request.json();
    const db = getDb();
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
    await requireAuth();
    const db = getDb();
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
