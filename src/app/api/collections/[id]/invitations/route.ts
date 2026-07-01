import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCapability } from "@/server/dal/collection-access";
import { InvitationController } from "@/server/api/invitations";
import { errorResponse } from "@/server/api/http-errors";
import { getPostHogClient } from "@/lib/posthog-server";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  // invitations:read = owner — only the collection owner may list invitations (tightens PR1).
  const access = await requireApiCapability(db, params.id, session.user.id, "invitations:read");
  if (access instanceof NextResponse) return access;
  const invitations = await InvitationController.fromDb(db).listByCollection(params.id);
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
  // invitations:manage = owner — only the collection owner may create invitations (closes 4wj2-A).
  const access = await requireApiCapability(db, params.id, session.user.id, "invitations:manage");
  if (access instanceof NextResponse) return access;
  try {
    const invitation = await InvitationController.fromDb(db).createInvitation(params.id, body);
    const phClient = getPostHogClient();
    phClient.capture({
      distinctId: session.user.id,
      event: 'invitation_sent',
      properties: { collection_id: params.id, invitation_id: invitation.id },
    });
    await phClient.shutdown();
    return NextResponse.json(invitation, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
