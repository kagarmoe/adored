import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { InvitationController } from "@/server/api/invitations";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const access = await requireApiCollectionAccess(db, params.id, session.user.id);
  if (access instanceof NextResponse) return access;
  const invitations = await new InvitationRepository(db).findByCollection(params.id);
  return NextResponse.json(invitations);
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const db = getDb();
  const access = await requireApiCollectionAccess(db, params.id, session.user.id);
  if (access instanceof NextResponse) return access;
  try {
    const controller = new InvitationController(new InvitationRepository(db));
    const invitation = await controller.createInvitation(params.id, body);
    return NextResponse.json(invitation, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
