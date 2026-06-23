import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCapability } from "@/server/dal/collection-access";
import { MemberController } from "@/server/api/members";

// Verify the [mid] membership row actually belongs to collection [id] (belongs-to-parent).
async function membershipBelongsToCollection(db: ReturnType<typeof getDb>, mid: string, collectionId: string) {
  return (await MemberController.fromDb(db).getByIdForCollection(mid, collectionId)) !== null;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string; mid: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  // members:read = curator — any curator may read a membership.
  const access = await requireApiCapability(db, params.id, session.user.id, "members:read");
  if (access instanceof NextResponse) return access;
  if (!(await membershipBelongsToCollection(db, params.mid, params.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(await MemberController.fromDb(db).getMember(params.mid));
}

// PATCH removed (purses-2wzz): no UI caller; members have no editable fields under
// the role model (UpdateMemberSchema is empty; repo update writes only updatedAt).
// Next.js returns 405 automatically for unexported methods.

export async function DELETE(_request: NextRequest, { params }: { params: { id: string; mid: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  if (!(await membershipBelongsToCollection(db, params.mid, params.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // members:manage = owner — only the collection owner may remove members.
  const access = await requireApiCapability(db, params.id, session.user.id, "members:manage");
  if (access instanceof NextResponse) return access;
  await MemberController.fromDb(db).removeMember(params.mid);
  return NextResponse.json({ message: "Member removed" });
}
