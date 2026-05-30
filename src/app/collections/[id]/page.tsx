import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { AppLayout } from "@/components/layout";
import { Badge, Button, Card } from "@/components/ui";
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
  const itemRepo = new ItemRepository(db);
  const sessionRepo = new SessionRepository(db);
  const resultRepo = new SortResultRepository(db);
  const [collection, items, sessions, results] = await Promise.all([
    collectionRepo.findById(params.id),
    itemRepo.findByCollection(params.id),
    sessionRepo.findByCollection(params.id),
    resultRepo.findByCollection(params.id),
  ]);

  if (!collection) {
    redirect("/collections");
  }

  const activeSession = sessions.find((sortSession) => sortSession.status === "active");
  const finalizedResults = results.filter((result) => result.status === "finalized");
  const stats = [
    { label: "Items", value: items.length },
    { label: "Sessions", value: sessions.length },
    { label: "Finalized", value: finalizedResults.length },
  ];

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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <Card key={stat.label} padding="md">
              <p className="text-sm font-medium text-gray-500">{stat.label}</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{stat.value}</p>
            </Card>
          ))}
        </div>

        {activeSession && (
          <Card padding="lg" className="border-blue-200 bg-blue-50">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-blue-950">Active Sorting Session</h2>
                  <Badge variant="active">active</Badge>
                </div>
                <p className="text-sm text-blue-900">
                  {activeSession.goal || "Preference discovery"}
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/collections/${collection.id}/sort/${activeSession.id}`}>
                  <Button>Resume</Button>
                </Link>
                <Button variant="secondary">Abandon</Button>
              </div>
            </div>
          </Card>
        )}

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
