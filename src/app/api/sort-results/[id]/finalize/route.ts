import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ResultController } from "@/server/api/results";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";
import { errorResponse } from "@/server/api/http-errors";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;
    const resultRepo = new SortResultRepository(db);
    const controller = new ResultController(resultRepo);

    const result = await controller.finalizeResult(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
