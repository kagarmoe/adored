import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout";
import { trail } from "@/components/layout/breadcrumb-trails";
import { CollectionForm } from "@/features/collections/CollectionForm";

export default async function CreateCollectionPage() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <AppLayout breadcrumbs={trail.collectionNew()}>
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="mb-6 text-2xl text-ink sm:mb-8 sm:text-3xl">Create collection</h1>
        <CollectionForm mode="create" />
      </div>
    </AppLayout>
  );
}
