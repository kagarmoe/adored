import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiItemCapability } from "@/server/dal/collection-access";
import { SortResultService } from "@/server/services/SortResultService";
import { errorResponse } from "@/server/api/http-errors";

// Owner-only bulk-detach: remove an item from all DRAFT sort results in one call,
// the purge-prep companion to POST /api/items/[id]/purge. A deliberate t9l
// exception (a collection-owner op crossing the per-curator boundary; draft-only,
// finalized untouched). No confirm body: the op is re-derivable by regenerating
// the affected draft. Authz BEFORE any body
// access: a non-owner never reaches the service.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();

    // items:purge = owner. includeDeleted: true — item may be soft-deleted pre-purge.
    const item = await requireApiItemCapability(db, id, user.id, "items:purge", { includeDeleted: true });
    if (item instanceof NextResponse) return item; // 404 (absent) / 403 (not owner)

    const service = SortResultService.fromDb(db);
    const { removed, remainingInFinalized } =
      await service.removeItemFromDraftResults(item.id);

    return NextResponse.json({ removed, remainingInFinalized });
  } catch (error) {
    return errorResponse(error);
  }
}
