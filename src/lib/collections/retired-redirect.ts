import { getSession } from "@/lib/auth";
import { permanentRedirect, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";

/**
 * Retired collection pages (spec §4) bounce old links here. The access guard runs
 * FIRST — page-authz-enumeration expects the stranger's redirect to be the first
 * throw — then a permanent (308) move to the Sort screen or the live Ranking.
 */
export async function redirectRetired(id: string, to: "sort" | "results"): Promise<never> {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  const collection = await requireCollectionAccess(getDb(), id, session.user.id);
  permanentRedirect(`/collections/${collection.slug ?? collection.id}/${to}`);
}
