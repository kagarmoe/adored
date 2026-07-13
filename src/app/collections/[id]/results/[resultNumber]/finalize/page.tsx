import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ResultController } from "@/server/api/results";
import { AppLayout } from "@/components/layout";
import { FinalizeResultForm } from "@/features/results/FinalizeResultForm";

interface FinalizePageProps {
  params: Promise<{ id: string; resultNumber: string }>;
}

export default async function FinalizePage({ params }: FinalizePageProps) {
  const { id, resultNumber: resultNumberParam } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);

  const resultNumber = Number(resultNumberParam);
  const result =
    resultNumber > 0 && Number.isInteger(resultNumber)
      ? await ResultController.fromDb(db).getByCollectionAndNumber(collection.id, resultNumber)
      : null;

  if (!result || result.collectionId !== collection.id || result.curatorId !== session.user.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/results`);
  }

  // A finalized result is immutable (name included, purses-gmn): the finalize
  // form would PATCH-rename then re-finalize, both now 409. Send the curator to
  // the read-only result instead of presenting actions that fail.
  if (result.status === "finalized") {
    redirect(`/collections/${collection.slug ?? collection.id}/results/${result.number}`);
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
          <h1 className="text-3xl text-ink">Finalize results</h1>
          <p className="mt-2 text-ink-soft">Lock the current order and make this result ready to share.</p>
        </div>
        <FinalizeResultForm
          collectionId={collection.slug ?? collection.id}
          resultId={result.id}
          resultNumber={result.number}
          defaultName={result.name}
        />
      </div>
    </AppLayout>
  );
}
