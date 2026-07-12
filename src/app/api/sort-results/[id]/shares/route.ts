import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ShareController } from "@/server/api/shares";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";
import { errorResponse } from "@/server/api/http-errors";
import { getPostHogClient } from "@/lib/posthog-server";

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
    const body = await request.json();
    const share = await ShareController.fromDb(db).createShare(id, body);
    const phClient = getPostHogClient();
    phClient.capture({
      distinctId: user.id,
      event: 'sort_result_shared',
      properties: { result_id: id, share_id: share.id },
    });
    await phClient.flush();
    return NextResponse.json(share, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
