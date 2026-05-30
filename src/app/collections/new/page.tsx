import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout";
import { CollectionForm } from "@/features/collections/CollectionForm";

export default async function CreateCollectionPage() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: "Create" },
      ]}
    >
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Create Collection</h1>
        <CollectionForm mode="create" />
      </div>
    </AppLayout>
  );
}
