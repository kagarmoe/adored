import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { CollectionPurgeService } from "@/server/services/CollectionPurgeService";

const ConfirmSchema = z.object({ confirm: z.string() });

// Permanent owner-only cascade purge. Order matters for security: authenticate,
// resolve the collection INCLUDING soft-deleted (the canonical path is
// DELETE -> purge), gate as the OWNER, and ONLY THEN parse the confirm body —
// which must echo the exact collection name. A non-owner with any body gets
// 403/404, never a 400 that leaks the collection's existence or name.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const db = getDb();

    const collection = await new CollectionRepository(db).findByIdIncludingDeleted(params.id);
    if (!collection) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (collection.ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = ConfirmSchema.safeParse(body);
    if (!parsed.success || parsed.data.confirm !== collection.name) {
      return NextResponse.json(
        { error: "Type the collection name to confirm" },
        { status: 400 },
      );
    }

    await new CollectionPurgeService(db).purge(collection, user.id);
    return NextResponse.json({ message: "Collection purged" });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status },
    );
  }
}
