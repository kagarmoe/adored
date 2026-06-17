// src/server/dal/collection-access.ts
import { NextResponse } from "next/server";
import type { Database } from "@/lib/db";
import type { Collection } from "@/types";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

// Member-or-owner gate for collection-scoped API routes. ULID-only (params.id at
// the API layer is always a ULID — slugs are a nav concern). Returns the collection
// when the user may access it, else a NextResponse the caller returns immediately:
// 404 if the collection is absent, 403 if it exists but the user is neither member
// nor owner. (purses-pv9's DAL will later absorb this single check.)
export async function requireApiCollectionAccess(
  db: Database,
  collectionId: string,
  userId: string,
): Promise<Collection | NextResponse> {
  const collection = await new CollectionRepository(db).findById(collectionId);
  if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const membership = await new MembershipRepository(db).findByUser(userId, collectionId);
  if (!membership && collection.ownerId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return collection;
}
