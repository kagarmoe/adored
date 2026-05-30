import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { AppLayout } from "@/components/layout";
import { Button, EmptyState } from "@/components/ui";
import { CollectionCard } from "@/features/collections/CollectionCard";
import Link from "next/link";

export default async function CollectionsPage() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collectionRepo = new CollectionRepository(db);
  const collections = await collectionRepo.findByOwner(session.user.id);

  return (
    <AppLayout breadcrumbs={[{ label: "Collections" }]}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Your Collections</h1>
            <p className="text-gray-600 mt-2">Organize and sort your favorite items</p>
          </div>
          <Link href="/collections/new">
            <Button>New Collection</Button>
          </Link>
        </div>

        {/* Collections Grid */}
        {collections.length === 0 ? (
          <EmptyState
            heading="No collections yet"
            message="Create your first collection to start organizing items"
            action={{
              label: "Create Collection",
              onClick: () => (window.location.href = "/collections/new"),
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
