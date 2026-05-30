import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ResultController } from "@/server/api/results";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const resultRepo = new SortResultRepository(db);
    const controller = new ResultController(resultRepo);
    const results = await controller.listResults(user.id);
    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
