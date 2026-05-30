import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

interface ItemUpdateRequest {
  name?: string;
  brand?: string | null;
  style?: string | null;
  color?: string | null;
  material?: string | null;
  category?: string | null;
  notes?: string | null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const itemRepo = new ItemRepository(db);
  const membershipRepo = new MembershipRepository(db);

  try {
    // Verify item belongs to collection and user has permission
    const item = await itemRepo.findById(params.itemId);
    if (!item || item.collectionId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await membershipRepo.findByUser(
      session.user.id,
      params.id
    );
    if (!membership || !membership.canEditMetadata) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: ItemUpdateRequest = await req.json();
    const updated = await itemRepo.update(params.itemId, {
      name: body.name,
      brand: body.brand,
      style: body.style,
      color: body.color,
      material: body.material,
      category: body.category,
      notes: body.notes,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 }
    );
  }
}
