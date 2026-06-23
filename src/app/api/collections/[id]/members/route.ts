import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { MemberController } from "@/server/api/members";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCollectionAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;

    const membershipRepo = new MembershipRepository(db);
    const collectionRepo = new CollectionRepository(db);
    const controller = new MemberController(membershipRepo, collectionRepo);

    const members = await controller.listMembers(params.id);
    return NextResponse.json(members);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const db = getDb();
    const membershipRepo = new MembershipRepository(db);
    const collectionRepo = new CollectionRepository(db);
    const controller = new MemberController(membershipRepo, collectionRepo);

    // Check if user is collection manager (admin)
    const isManager = await controller.isCollectionManager(params.id, user.id);
    if (!isManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const member = await controller.addMember(params.id, body);
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
