import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { SortResultService } from "@/server/services/SortResultService";
import { errorResponse } from "@/server/api/http-errors";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;
    const result = await SortResultService.fromDb(db).supersedeResult(params.id);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    // errorResponse already maps SupersedeStateError → 409 and Unauthorized → 401.
    return errorResponse(error);
  }
}
