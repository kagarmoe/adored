import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { CollectionController } from "@/server/api/collections";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const user = await requireAuth();
    const db = getDb();
    const collectionRepo = new CollectionRepository(db);
    const controller = new CollectionController(collectionRepo);

    const collections = await controller.listCollections(user.id);
    return NextResponse.json(collections);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const db = getDb();
    const collectionRepo = new CollectionRepository(db);
    const membershipRepo = new MembershipRepository(db);
    const controller = new CollectionController(collectionRepo);

    const collection = await controller.createCollection(user.id, body);
    await membershipRepo.create({
      collectionId: collection.id,
      userId: user.id,
      role: "owner",
      canManageCollection: true,
      canInviteMembers: true,
      canAddItems: true,
      canDeleteItems: true,
      canEditMetadata: true,
      canAddPhotos: true,
      canDeletePhotos: true,
      canSort: true,
      canViewOutputs: true,
    });
    return NextResponse.json(collection, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
