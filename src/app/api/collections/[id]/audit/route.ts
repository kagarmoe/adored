import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionOwner } from "@/server/dal/collection-access";
import { AuditController } from "@/server/api/audit";

// Owner-only read of a collection's permanent-purge trail. 404 (absent) is
// returned BEFORE 403 (not owner) by the gate — the existence-oracle convention
// (API.md §46). The purge trail is the owner's concern; a member must not read it.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const db = getDb();

    const owned = await requireApiCollectionOwner(db, params.id, user.id);
    if (owned instanceof NextResponse) return owned; // 404 absent / 403 not owner

    const limitParam = request.nextUrl.searchParams.get("limit");
    const entries = await AuditController.fromDb(db).listByCollection(params.id, {
      limit: limitParam == null ? undefined : Number(limitParam),
    });
    return NextResponse.json(entries);
  } catch (error) {
    const status = error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status },
    );
  }
}
