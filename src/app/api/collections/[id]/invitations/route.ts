import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCapability } from "@/server/dal/collection-access";
import { InvitationController } from "@/server/api/invitations";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  // invitations:read = owner — only the collection owner may list invitations (tightens PR1).
  const access = await requireApiCapability(db, id, session.user.id, "invitations:read");
  if (access instanceof NextResponse) return access;
  const invitations = await InvitationController.fromDb(db).listByCollection(id);
  return NextResponse.json(invitations);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const db = getDb();
  // invitations:manage = owner — only the collection owner may create invitations (closes 4wj2-A).
  const access = await requireApiCapability(db, id, session.user.id, "invitations:manage");
  if (access instanceof NextResponse) return access;
  try {
    const invitation = await InvitationController.fromDb(db).createInvitation(id, body);
    return NextResponse.json(invitation, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
