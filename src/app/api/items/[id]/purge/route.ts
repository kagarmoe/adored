import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiItemCapability } from "@/server/dal/collection-access";
import { ItemPurgeService } from "@/server/services/ItemPurgeService";
import { errorResponse } from "@/server/api/http-errors";

const PurgeConfirmSchema = z.object({ confirm: z.literal("PURGE") });

// Permanent owner-only purge. Order matters for security: authenticate, resolve
// the item (including soft-deleted), gate as the COLLECTION OWNER, and ONLY THEN
// parse the confirm body. A non-owner with a malformed body must get 403, never a
// 400 that would leak body validity as an existence/permission oracle.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();

    // items:purge = owner. includeDeleted: true — the item to purge may be soft-deleted.
    const item = await requireApiItemCapability(db, id, user.id, "items:purge", { includeDeleted: true });
    if (item instanceof NextResponse) return item; // 404 (absent) / 403 (not owner)

    // Authz passed — only now parse + validate the confirm body.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!PurgeConfirmSchema.safeParse(body).success) {
      return NextResponse.json({ error: "Confirmation required" }, { status: 400 });
    }

    await ItemPurgeService.fromDb(db).purge(item, user.id);

    return NextResponse.json({ message: "Item purged" });
  } catch (error) {
    return errorResponse(error);
  }
}
