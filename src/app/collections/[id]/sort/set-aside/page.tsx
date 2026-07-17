import { getSession } from "@/lib/auth";
import { redirect, permanentRedirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";

interface SetAsideRedirectPageProps {
  params: Promise<{ id: string }>;
}

// The set-aside shelf moved to the Decide side (purses-znkt.4): /results/set-aside.
// This route stays only to bounce stale links/bookmarks. The access guard MUST
// run FIRST — page-authz-enumeration.integration.test.ts exact-matches the
// stranger redirect as the first throw a non-member hits here, before the
// permanentRedirect below ever fires. permanentRedirect (308) signals the move
// is durable, unlike redirect()'s 307 — first use of permanentRedirect in this repo.
export default async function SetAsideRedirectPage({ params }: SetAsideRedirectPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);

  permanentRedirect(`/collections/${collection.slug ?? collection.id}/results/set-aside`);
}
