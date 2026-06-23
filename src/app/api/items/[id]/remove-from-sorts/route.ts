import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { requireApiItemCapability } from "@/server/dal/collection-access";
import { SortResultService } from "@/server/services/SortResultService";

// Owner-only bulk-detach: remove an item from all DRAFT sort results in one call,
// the purge-prep companion to POST /api/items/[id]/purge. A deliberate t9l
// exception (a collection-owner op crossing the per-curator boundary; draft-only,
// finalized untouched). No confirm body — consistent with deleteResultItem; the
// op is re-derivable by regenerating the affected draft. Authz BEFORE any body
// access: a non-owner never reaches the service.
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const db = getDb();

    // items:purge = owner. includeDeleted: true — item may be soft-deleted pre-purge.
    const item = await requireApiItemCapability(db, params.id, user.id, "items:purge", { includeDeleted: true });
    if (item instanceof NextResponse) return item; // 404 (absent) / 403 (not owner)

    const service = new SortResultService(
      new SortResultRepository(db),
      new SortResultItemRepository(db),
      new CollectionPreferenceItemRepository(db),
      db,
    );
    const { removed, remainingInFinalized } =
      await service.removeItemFromDraftResults(item.id);

    return NextResponse.json({ removed, remainingInFinalized });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status },
    );
  }
}
