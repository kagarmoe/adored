import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { AppLayout } from "@/components/layout";
import { Card } from "@/components/ui";
import Link from "next/link";

interface CollectionPageProps {
  params: { id: string };
}

export default async function CollectionPage({ params }: CollectionPageProps) {
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

  const dashboardLinks = [
    {
      label: "Items",
      href: `/collections/${collection.id}/items`,
      description: "Manage items in this collection",
      icon: "📦",
    },
    {
      label: "Sort",
      href: `/collections/${collection.id}/sort`,
      description: "Start a sorting session",
      icon: "📊",
    },
    {
      label: "Results",
      href: `/collections/${collection.id}/results`,
      description: "View sorting results",
      icon: "🎯",
    },
    {
      label: "Members",
      href: `/collections/${collection.id}/members`,
      description: "Manage collaborators",
      icon: "👥",
    },
    {
      label: "Settings",
      href: `/collections/${collection.id}/edit`,
      description: "Edit collection details",
      icon: "⚙️",
    },
  ];

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name },
      ]}
    >
      <div className="space-y-8">
        {/* Collection Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{collection.name}</h1>
          {collection.description && (
            <p className="text-gray-600 mt-2">{collection.description}</p>
          )}
          <p className="text-sm text-gray-500 mt-4">
            Created {new Date(collection.createdAt).toLocaleDateString()}
          </p>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboardLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card interactive padding="lg">
                <div className="text-center">
                  <div className="text-4xl mb-3">{link.icon}</div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{link.label}</h3>
                  <p className="text-sm text-gray-600">{link.description}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
