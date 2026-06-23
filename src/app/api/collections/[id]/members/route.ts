import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { MemberController } from "@/server/api/members";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { requireApiCapability } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    // members:read = curator — any curator may list members.
    const access = await requireApiCapability(db, params.id, user.id, "members:read");
    if (access instanceof NextResponse) return access;

    const members = await new MemberController(
      new MembershipRepository(db),
    ).listMembers(params.id);
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
    // members:manage = owner — only the collection owner may add members.
    const access = await requireApiCapability(db, params.id, user.id, "members:manage");
    if (access instanceof NextResponse) return access;

    const member = await new MemberController(
      new MembershipRepository(db),
    ).addMember(params.id, body);
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
