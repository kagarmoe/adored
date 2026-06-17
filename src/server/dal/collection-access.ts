// src/server/dal/collection-access.ts
import { NextResponse } from "next/server";
import type { Database } from "@/lib/db";
import type { Collection, SortResult } from "@/types";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";

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

// Resolve a sort-result, then gate by collection access AND curator ownership
// (results are curator-scoped — each curator sorts independently, per t9l).
// Returns the result when the caller may act on it, else a NextResponse to return.
export async function requireApiResultAccess(
  db: Database,
  resultId: string,
  userId: string,
): Promise<SortResult | NextResponse> {
  const result = await new SortResultRepository(db).findById(resultId);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await requireApiCollectionAccess(db, result.collectionId, userId);
  if (access instanceof NextResponse) return access;
  if (result.curatorId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return result;
}
