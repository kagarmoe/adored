import { redirect } from "next/navigation";
import type { Database } from "@/lib/db";
import type { Collection } from "@/types";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

/** Load a collection the current user may access (member or owner). Redirects to
 *  /collections if the collection doesn't exist or the user has no access. The
 *  single guard for every collection-scoped page — call it right after the
 *  session check. Returns the collection so the page can use it. */
export async function requireCollectionAccess(
  db: Database,
  collectionId: string,
  userId: string,
): Promise<Collection> {
  const [collection, membership] = await Promise.all([
    new CollectionRepository(db).findById(collectionId),
    new MembershipRepository(db).findByUser(userId, collectionId),
  ]);
  if (!collection) redirect("/collections");
  if (!membership && collection.ownerId !== userId) redirect("/collections");
  return collection;
}
