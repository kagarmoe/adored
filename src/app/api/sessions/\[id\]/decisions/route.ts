import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { DecisionController } from "@/server/api/decisions";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const db = getDb();
    const decisionRepo = new DecisionEventRepository(db);
    const controller = new DecisionController(decisionRepo);

    const decisions = await controller.listDecisions(params.id);
    return NextResponse.json(decisions);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const body = await request.json();

    const db = getDb();
    const decisionRepo = new DecisionEventRepository(db);
    const controller = new DecisionController(decisionRepo);

    const decision = await controller.createDecision(params.id, body);
    return NextResponse.json(decision, { status: 201 });
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
