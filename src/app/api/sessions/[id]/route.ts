import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { SessionController } from "@/server/api/sessions";
import { errorResponse } from "@/server/api/http-errors";

// Load the session, then authorize its collection. Returns {} or a NextResponse to return immediately.
async function authorizeSession(db: ReturnType<typeof getDb>, sessionId: string, userId: string) {
  let sortSession: import("@/types").Session;
  try {
    sortSession = await SessionController.fromDb(db).getSession(sessionId);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const access = await requireApiCollectionAccess(db, sortSession.collectionId, userId);
  if (access instanceof NextResponse) return access;
  // purses-t9l: each user sorts independently — only the session's curator may
  // read, update, or delete it (even other collection members/owners may not).
  if (sortSession.curatorId !== userId) {
    return NextResponse.json(
      { error: "You can only access your own sorting session" },
      { status: 403 },
    );
  }
  return {};
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const guard = await authorizeSession(db, params.id, session.user.id);
  if (guard instanceof NextResponse) return guard;
  const result = await SessionController.fromDb(db).getSession(params.id);
  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const db = getDb();
  const guard = await authorizeSession(db, params.id, session.user.id);
  if (guard instanceof NextResponse) return guard;
  try {
    const result = await SessionController.fromDb(db).updateSession(params.id, body);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const guard = await authorizeSession(db, params.id, session.user.id);
  if (guard instanceof NextResponse) return guard;
  await SessionController.fromDb(db).deleteSession(params.id);
  return NextResponse.json({ message: "Session deleted" });
}
