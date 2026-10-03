import { getSession } from "@/lib/auth";
import { permanentRedirect, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";

/**
 * Retired collection pages (spec §4, §5) bounce old links here. The access guard runs
 * FIRST — page-authz-enumeration expects the stranger's redirect to be the first
 * throw — then a permanent (308) move to the home (""), the Sort screen or the Ranking.
 */
export async function redirectRetired(
  id: string,
  to: "" | "sort" | "results",
  query?: URLSearchParams,
): Promise<never> {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  const collection = await requireCollectionAccess(getDb(), id, session.user.id);
  const path = `/collections/${collection.slug ?? collection.id}${to ? `/${to}` : ""}`;
  const qs = query?.toString();
  permanentRedirect(qs ? `${path}?${qs}` : path);
}
