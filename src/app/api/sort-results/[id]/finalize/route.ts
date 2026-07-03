import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ResultController } from "@/server/api/results";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";
import { errorResponse } from "@/server/api/http-errors";
import { getPostHogClient } from "@/lib/posthog-server";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;
    const result = await ResultController.fromDb(db).finalizeResult(params.id);
    const phClient = getPostHogClient();
    phClient.capture({
      distinctId: user.id,
      event: 'sort_result_finalized',
      properties: { result_id: params.id },
    });
    await phClient.flush();
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
