import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { MemberController } from "@/server/api/members";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";

// Verify the [mid] membership row actually belongs to collection [id] (belongs-to-parent).
async function membershipBelongsToCollection(db: ReturnType<typeof getDb>, mid: string, collectionId: string) {
  const row = await new MembershipRepository(db).findById(mid);
  return !!row && row.collectionId === collectionId;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string; mid: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const access = await requireApiCollectionAccess(db, params.id, session.user.id);
  if (access instanceof NextResponse) return access;
  if (!(await membershipBelongsToCollection(db, params.mid, params.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ctrl = new MemberController(new MembershipRepository(db), new CollectionRepository(db));
  return NextResponse.json(await ctrl.getMember(params.mid));
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string; mid: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const db = getDb();
  if (!(await membershipBelongsToCollection(db, params.mid, params.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ctrl = new MemberController(new MembershipRepository(db), new CollectionRepository(db));
  if (!(await ctrl.isCollectionManager(params.id, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(await ctrl.updateMember(params.mid, body));
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string; mid: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  if (!(await membershipBelongsToCollection(db, params.mid, params.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ctrl = new MemberController(new MembershipRepository(db), new CollectionRepository(db));
  if (!(await ctrl.isCollectionManager(params.id, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await ctrl.removeMember(params.mid);
  return NextResponse.json({ message: "Member removed" });
}
