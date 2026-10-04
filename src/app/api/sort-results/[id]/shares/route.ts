import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { CreateShareSchema, ShareController } from "@/server/api/shares";
import { SortResultService } from "@/server/services/SortResultService";
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
    const shares = await ShareController.fromDb(db).listShares(id);
    return NextResponse.json(shares);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    // Authz BEFORE body parse: an unauthorized caller must get 403/404, never a
    // body-shape 400 that leaks the result's existence (§3.4 oracle posture).
    const access = await requireApiResultAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;
    const { expiresAt } = CreateShareSchema.parse(await request.json());
    // Under the curator lock (purses-w7ss.18): never between a deletion's shares and results deletes.
    const share = await SortResultService.fromDb(db).createShare(id, expiresAt ? new Date(expiresAt) : undefined);
    if (!share) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(share, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
