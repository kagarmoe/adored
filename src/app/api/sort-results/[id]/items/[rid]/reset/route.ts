import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ResultItemController } from "@/server/api/result-items";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";
import { errorResponse } from "@/server/api/http-errors";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string; rid: string } },
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;
    if (access.status === "finalized") {
      return NextResponse.json(
        { error: "Result is finalized" },
        { status: 409 },
      );
    }
    const ctrl = ResultItemController.fromDb(db);
    const existing = await ctrl.getByIdForResult(params.rid, params.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const item = await ctrl.resetResultItem(params.rid);
    return NextResponse.json(item);
  } catch (error) {
    return errorResponse(error);
  }
}
