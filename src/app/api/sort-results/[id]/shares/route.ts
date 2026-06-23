import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ShareController } from "@/server/api/shares";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;
    const shareRepo = new SortResultShareRepository(db);
    const controller = new ShareController(shareRepo);
    const shares = await controller.listShares(params.id);
    return NextResponse.json(shares);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const db = getDb();
    const access = await requireApiResultAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;
    const shareRepo = new SortResultShareRepository(db);
    const controller = new ShareController(shareRepo);
    const share = await controller.createShare(params.id, body);
    return NextResponse.json(share, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
