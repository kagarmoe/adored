import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { ItemController } from "@/server/api/items";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const access = await requireApiCollectionAccess(db, params.id, session.user.id);
  if (access instanceof NextResponse) return access;
  const items = await new ItemController(new ItemRepository(db)).listItems(params.id);
  return NextResponse.json(items);
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return errorResponse(error);
  }
  const db = getDb();
  const access = await requireApiCollectionAccess(db, params.id, session.user.id);
  if (access instanceof NextResponse) return access;
  try {
    const item = await new ItemController(new ItemRepository(db)).createItem(params.id, body);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
