import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { CollectionController } from "@/server/api/collections";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";
import { withTransaction } from "@/lib/transactions";

export async function GET() {
  try {
    const user = await requireAuth();
    const db = getDb();
    const collectionRepo = new CollectionRepository(db);
    const controller = new CollectionController(collectionRepo);

    const collections = await controller.listCollections(user.id);
    return NextResponse.json(collections);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const db = getDb();
    const collection = await withTransaction(db, async (tx) => {
      const txCollectionRepo = new CollectionRepository(tx);
      const txMembershipRepo = new MembershipRepository(tx);
      const txController = new CollectionController(txCollectionRepo);

      const col = await txController.createCollection(user.id, body);
      await txMembershipRepo.create({
        collectionId: col.id,
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
      return col;
    });
    return NextResponse.json(collection, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
