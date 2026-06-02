import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
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
  const collectionRepo = new CollectionRepository(db);
  const resultRepo = new SortResultRepository(db);
  const [collection, result] = await Promise.all([
    collectionRepo.findById(params.id),
    resultRepo.findById(params.resultId),
  ]);

  if (!collection || !result || result.collectionId !== params.id || result.curatorId !== session.user.id) {
    redirect(`/collections/${params.id}/results`);
  }

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${params.id}` },
        { label: "Results", href: `/collections/${params.id}/results` },
        { label: "Finalize" },
      ]}
    >
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-ink">Finalize Results</h1>
          <p className="mt-2 text-ink-soft">Lock the current order and make this result ready to share.</p>
        </div>
        <FinalizeResultForm collectionId={params.id} resultId={params.resultId} defaultName={result.name} />
      </div>
    </AppLayout>
  );
}
