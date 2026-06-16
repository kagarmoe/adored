import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { AppLayout } from "@/components/layout";
import { FinalizeResultForm } from "@/features/results/FinalizeResultForm";

interface FinalizePageProps {
  params: { id: string; resultId: string };
}

export default async function FinalizePage({ params }: FinalizePageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);
  const resultRepo = new SortResultRepository(db);
  const result = await resultRepo.findById(params.resultId);

  if (!result || result.collectionId !== collection.id || result.curatorId !== session.user.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/results`);
  }

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
        { label: "Results", href: `/collections/${collection.slug ?? collection.id}/results` },
        { label: "Finalize" },
      ]}
    >
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl text-ink">Finalize Results</h1>
          <p className="mt-2 text-ink-soft">Lock the current order and make this result ready to share.</p>
        </div>
        <FinalizeResultForm collectionId={collection.slug ?? collection.id} resultId={params.resultId} defaultName={result.name} />
      </div>
    </AppLayout>
  );
}
