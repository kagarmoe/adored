import { NextRequest, NextResponse } from "next/server";
import { ShareController } from "@/server/api/shares";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest
) {
  try {
    const db = getDb();
    const shareRepo = new SortResultShareRepository(db);
    const controller = new ShareController(shareRepo);
    const share = await controller.viewSharedResult();
    return NextResponse.json(share);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 404 }
    );
  }
}
