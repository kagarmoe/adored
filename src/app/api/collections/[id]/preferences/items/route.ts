import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { PreferenceController } from "@/server/api/preferences";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCollectionAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;

    const items = await PreferenceController.fromDb(db).listItemPreferences(params.id, user.id);
    return NextResponse.json(items);
  } catch (error) {
    return errorResponse(error);
  }
}
