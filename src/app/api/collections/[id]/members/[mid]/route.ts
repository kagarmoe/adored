import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { MemberController } from "@/server/api/members";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; mid: string } }
) {
  try {
    await requireAuth();
    const db = getDb();
    const membershipRepo = new MembershipRepository(db);
    const collectionRepo = new CollectionRepository(db);
    const controller = new MemberController(membershipRepo, collectionRepo);

    const member = await controller.getMember(params.mid);
    return NextResponse.json(member);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; mid: string } }
) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const db = getDb();
    const membershipRepo = new MembershipRepository(db);
    const collectionRepo = new CollectionRepository(db);
    const controller = new MemberController(membershipRepo, collectionRepo);

    // Check if user is collection manager
    const isManager = await controller.isCollectionManager(params.id, user.id);
    if (!isManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const member = await controller.updateMember(params.mid, body);
    return NextResponse.json(member);
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; mid: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const membershipRepo = new MembershipRepository(db);
    const collectionRepo = new CollectionRepository(db);
    const controller = new MemberController(membershipRepo, collectionRepo);

    // Check if user is collection manager
    const isManager = await controller.isCollectionManager(params.id, user.id);
    if (!isManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await controller.removeMember(params.mid);
    return NextResponse.json({ message: "Member removed" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
