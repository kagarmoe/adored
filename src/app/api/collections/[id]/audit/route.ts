import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionOwner } from "@/server/dal/collection-access";
import { AuditController } from "@/server/api/audit";
import { errorResponse } from "@/server/api/http-errors";

// Owner-only read of a collection's permanent-purge trail. 404 (absent) is
// returned BEFORE 403 (not owner) by the gate — the existence-oracle convention
// (API.md §46). The purge trail is the owner's concern; a member must not read it.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();

    const owned = await requireApiCollectionOwner(db, id, user.id);
    if (owned instanceof NextResponse) return owned; // 404 absent / 403 not owner

    const limitParam = request.nextUrl.searchParams.get("limit");
    const entries = await AuditController.fromDb(db).listByCollection(id, {
      limit: limitParam == null ? undefined : Number(limitParam),
    });
    return NextResponse.json(entries);
  } catch (error) {
    return errorResponse(error);
  }
}
