import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { ItemController } from "@/server/api/items";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { getDb } from "@/lib/db";

const PurgeConfirmSchema = z.object({ confirm: z.enum(["PURGE"]) });

export async function POST(
  request: NextRequest
) {
  try {
    await requireAuth();
    const body = await request.json();
    PurgeConfirmSchema.parse(body);

    const db = getDb();
    const itemRepo = new ItemRepository(db);
    const controller = new ItemController(itemRepo);

    await controller.purgeItem();
    return NextResponse.json({ message: "Item purged successfully" });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
