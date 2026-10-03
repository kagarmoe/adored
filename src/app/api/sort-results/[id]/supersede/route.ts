import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { SortResultService } from "@/server/services/SortResultService";
import { errorResponse } from "@/server/api/http-errors";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";

const SupersedeBody = z.object({ discardPins: z.literal(true).optional() }).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;
    // Body is optional: no body = "don't discard hand placements". Invalid JSON → 400 via errorResponse.
    const text = await request.text();
    const { discardPins } = SupersedeBody.parse(text ? JSON.parse(text) : {});
    const result = await SortResultService.fromDb(db).supersedeResult(id, { discardPins });
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    // errorResponse maps SupersedeStateError / RevisionDiscardsPinsError → 409, ZodError/SyntaxError → 400, Unauthorized → 401.
    return errorResponse(error);
  }
}
