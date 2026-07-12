import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { PreferenceController } from "@/server/api/preferences";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";
import { lockCollectionCurator, withTransaction } from "@/lib/transactions";
import { errorResponse } from "@/server/api/http-errors";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCollectionAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;

    // Same tx + same (collection, curator) advisory lock the decision writers
    // take. recalculatePreferences reads the collection's live items then
    // bulk-upserts preference rows for them; on the raw db those two statements
    // autocommit separately, so a purge could delete an item in between and the
    // upsert would die on 23503 (preferences.item_id has no ON DELETE CASCADE).
    // The purge takes this lock for every curator — this side must take it too.
    const prefs = await withTransaction(db, async (tx) => {
      await lockCollectionCurator(tx, params.id, user.id);
      return PreferenceController.fromDb(tx).recalculatePreferences(params.id, user.id);
    });
    return NextResponse.json({ message: "Preferences recalculated", preferences: prefs });
  } catch (error) {
    return errorResponse(error);
  }
}
