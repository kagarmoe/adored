import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiItemCapability } from "@/server/dal/collection-access";
import { ItemBinService } from "@/server/services/ItemBinService";
import { errorResponse } from "@/server/api/http-errors";

// The overlay write uses node-postgres (withTransaction inside the service). Pin the
// Node runtime (not Edge) so the tx handle is available.
export const runtime = "nodejs";

// Per-curator manual bin overlay (purses-xxo7). `bucket: null` clears the overlay.
const BinSchema = z.object({
  bucket: z.enum(["top", "high", "medium", "low"]).nullable(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    // preferences:write = curator; curatorId is ALWAYS the session user, never the
    // body, so the overlay is per-curator by construction. Soft-deleted item → 404.
    const item = await requireApiItemCapability(db, id, user.id, "preferences:write");
    if (item instanceof NextResponse) return item;

    const parsed = BinSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const effectiveBucket = await ItemBinService.fromDb(db).setBin(item, user.id, parsed.data.bucket);
    return NextResponse.json({ effectiveBucket }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
