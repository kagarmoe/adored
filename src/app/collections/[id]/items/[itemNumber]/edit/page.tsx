import { getSession } from "@/lib/auth";
import { redirect, permanentRedirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";

interface Props {
  params: Promise<{ id: string; itemNumber: string }>;
}

// The item panel replaced the edit page (spec 2026-10-01 §3). Kept only to bounce old
// links. The guard runs FIRST (page-authz-enumeration exact-matches the stranger's
// redirect); the number is used only when it is all digits, never interpolated raw.
export default async function ItemEditRedirect({ params }: Props) {
  const { id, itemNumber } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  const collection = await requireCollectionAccess(getDb(), id, session.user.id);
  const home = `/collections/${collection.slug ?? collection.id}`;
  permanentRedirect(/^\d+$/.test(itemNumber) ? `${home}/items/${itemNumber}` : home);
}
