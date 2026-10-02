import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { RankingController } from "@/server/api/ranking";
import { errorResponse } from "@/server/api/http-errors";

// Save and share (spec §4.4): one transaction, idempotent on body.saveKey —
// 201 when it saved, 200 with the same link on a replay. Authz before body parse.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCollectionAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;
    const body: unknown = await request.json();
    const saved = await RankingController.fromDb(db).save(access.id, user.id, body);
    return NextResponse.json(
      { resultNumber: saved.result.number, shareToken: saved.shareToken },
      { status: saved.created ? 201 : 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
