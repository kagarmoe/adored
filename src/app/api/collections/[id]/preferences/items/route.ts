import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { PreferenceController } from "@/server/api/preferences";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCollectionAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;

    const items = await PreferenceController.fromDb(db).listItemPreferences(id, user.id);
    return NextResponse.json(items);
  } catch (error) {
    return errorResponse(error);
  }
}
