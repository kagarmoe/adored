import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { SessionController } from "@/server/api/sessions";
import { errorResponse } from "@/server/api/http-errors";

// Undo "set aside": re-activate a soft-deleted session. The active
// GET/PATCH/DELETE handlers 404 on soft-deleted rows, so restore needs its own
// resolver that reaches set-aside sessions (getSessionIncludingDeletedOrNull).
//
// Authz mirrors authorizeSession's order — existence -> collection gate -> curator
// gate -> action. The curator gate is what closes the IDOR (purses-t9l): a
// DIFFERENT curator who IS a member of the shared collection passes the collection
// gate, so ONLY the curatorId check stops them from restoring someone else's
// set-aside session. A null lookup is 404 (truly absent); a thrown DB error
// propagates (-> 500), never masked as 404.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const sortSession = await SessionController.fromDb(db).getSessionIncludingDeletedOrNull(params.id);
  if (!sortSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await requireApiCollectionAccess(db, sortSession.collectionId, session.user.id);
  if (access instanceof NextResponse) return access;
  if (sortSession.curatorId !== session.user.id) {
    return NextResponse.json(
      { error: "You can only restore your own sorting session" },
      { status: 403 },
    );
  }
  // Auth (401/404/collection/curator) is resolved ABOVE, before the try — those
  // are deliberate status responses, not errors to map. Only the restore itself
  // can raise CurrentSessionExistsError (a newer in-progress session now holds
  // the slot), which errorResponse turns into a gentle 409 instead of a raw 500.
  try {
    const restored = await SessionController.fromDb(db).restoreSession(params.id);
    return NextResponse.json(restored);
  } catch (error) {
    return errorResponse(error); // CurrentSessionExistsError -> 409
  }
}
