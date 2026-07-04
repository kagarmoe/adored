import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { SessionController } from "@/server/api/sessions";
import { errorResponse } from "@/server/api/http-errors";
import { getPostHogClient } from "@/lib/posthog-server";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { collectionId, goal } = await req.json();
  if (!collectionId) return NextResponse.json({ error: "collectionId is required" }, { status: 400 });
  const db = getDb();
  const access = await requireApiCollectionAccess(db, collectionId, session.user.id);
  if (access instanceof NextResponse) return access;

  try {
    const newSession = await SessionController.fromDb(db).createSession(collectionId, session.user.id, { goal });
    const phClient = getPostHogClient();
    phClient.capture({
      distinctId: session.user.id,
      event: 'sort_session_created',
      properties: { session_id: newSession.id, collection_id: collectionId },
    });
    await phClient.flush();
    return NextResponse.json(newSession, { status: 201 });
  } catch (error) {
    // CurrentSessionExistsError -> gentle 409 (existing sort in this slot:
    // active / paused / completed / set-aside). Other errors keep their mapping.
    return errorResponse(error);
  }
}
