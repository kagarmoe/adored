import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { AppLayout } from "@/components/layout";
import { trail } from "@/components/layout/breadcrumb-trails";
import { StartSessionForm } from "@/features/sorting/StartSessionForm";

interface NewSortSessionPageProps {
  params: Promise<{ id: string }>;
}

export default async function NewSortSessionPage({ params }: NewSortSessionPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);

  return (
    <AppLayout breadcrumbs={trail.sortNew(collection)}>
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl text-ink sm:text-3xl">New sorting session</h1>
          <p className="mt-2 text-ink-soft">Choose the goal, scope, and pace for this pass.</p>
        </div>
        <StartSessionForm collectionId={collection.id} collectionSlug={collection.slug ?? collection.id} />
      </div>
    </AppLayout>
  );
}
