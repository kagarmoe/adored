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
    // Public route: never echo the underlying error to an unauthenticated caller
    // (it carries driver text, constraint names, sometimes values). Log, return generic.
    console.error("shared-results view failed", error);
    return NextResponse.json(
      { error: "That shared result isn't available." },
      { status: 404 }
    );
  }
}
