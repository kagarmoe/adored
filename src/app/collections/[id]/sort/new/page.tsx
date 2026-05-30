import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
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
  const collectionRepo = new CollectionRepository(db);
  const collection = await collectionRepo.findById(params.id);

  if (!collection) {
    redirect("/collections");
  }

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
          <h1 className="text-3xl font-bold text-gray-900">New Sorting Session</h1>
          <p className="mt-2 text-gray-600">Choose the goal, scope, and pace for this pass.</p>
        </div>
        <StartSessionForm collectionId={params.id} />
      </div>
    </AppLayout>
  );
}
