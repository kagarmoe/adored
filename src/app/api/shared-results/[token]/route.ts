import { NextRequest, NextResponse } from "next/server";
import { ShareController } from "@/server/api/shares";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const db = getDb();
    const share = await ShareController.fromDb(db).viewSharedResult(params.token);
    return NextResponse.json(share);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 404 }
    );
  }
}
