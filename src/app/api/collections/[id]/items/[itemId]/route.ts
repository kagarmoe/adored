import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";

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

  const body: ItemUpdateRequest = await req.json();
  const db = getDb();
  const itemRepo = new ItemRepository(db);

  try {
    const item = await itemRepo.update(params.itemId, {
      name: body.name,
      brand: body.brand,
      style: body.style,
      color: body.color,
      material: body.material,
      category: body.category,
      notes: body.notes,
    });

    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 }
    );
  }
}
