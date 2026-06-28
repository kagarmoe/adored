import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ResultController } from "@/server/api/results";
import { AppLayout } from "@/components/layout";
import { Badge, Card, EmptyState } from "@/components/ui";
import Link from "next/link";

interface ResultsPageProps {
  params: { id: string };
}

export default async function ResultsPage({ params }: ResultsPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);

  const results = await ResultController.fromDb(db).listResults(collection.id);

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
        { label: "Results" },
      ]}
    >
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl text-ink">Sorting results</h1>
          <p className="text-ink-soft mt-2">{results.length} result(s)</p>
        </div>

        {results.length === 0 ? (
          <EmptyState
            heading="No results yet"
            message="Complete a sorting session to generate results"
          />
        ) : (
          <div className="space-y-3">
            {results.map((result) => (
              <Link key={result.id} href={`/collections/${collection.slug ?? collection.id}/results/${result.number}`}>
                <Card interactive padding="md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-ink">Result #{result.number}</p>
                      <p className="text-sm text-ink-soft">{result.name}</p>
                      <div className="mt-2">
                        <Badge variant={result.status}>{result.status}</Badge>
                      </div>
                    </div>
                    <span className="text-sm text-ink-soft">
                      {new Date(result.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
