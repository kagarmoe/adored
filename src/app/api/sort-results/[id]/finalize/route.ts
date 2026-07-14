import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ResultController } from "@/server/api/results";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";
import { errorResponse } from "@/server/api/http-errors";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;
    const result = await ResultController.fromDb(db).finalizeResult(id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
