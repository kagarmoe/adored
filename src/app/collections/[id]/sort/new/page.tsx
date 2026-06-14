import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { AppLayout } from "@/components/layout";
import { StartSessionForm } from "@/features/sorting/StartSessionForm";

interface NewSortSessionPageProps {
  params: { id: string };
}

export default async function NewSortSessionPage({ params }: NewSortSessionPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${params.id}` },
        { label: "Sorting", href: `/collections/${params.id}/sort` },
        { label: "New Session" },
      ]}
    >
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl text-ink">New Sorting Session</h1>
          <p className="mt-2 text-ink-soft">Choose the goal, scope, and pace for this pass.</p>
        </div>
        <StartSessionForm collectionId={params.id} />
      </div>
    </AppLayout>
  );
}
