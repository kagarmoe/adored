import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
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
  const collectionRepo = new CollectionRepository(db);
  const resultRepo = new SortResultRepository(db);

  const collection = await collectionRepo.findById(params.id);
  if (!collection) {
    redirect("/collections");
  }

  const results = await resultRepo.findByCollection(params.id);

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${params.id}` },
        { label: "Results" },
      ]}
    >
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sorting Results</h1>
          <p className="text-gray-600 mt-2">{results.length} result(s)</p>
        </div>

        {results.length === 0 ? (
          <EmptyState
            heading="No results yet"
            message="Complete a sorting session to generate results"
          />
        ) : (
          <div className="space-y-3">
            {results.map((result) => (
              <Link key={result.id} href={`/collections/${params.id}/results/${result.id}`}>
                <Card interactive padding="md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">Result #{result.id.slice(0, 8)}</p>
                      <p className="text-sm text-gray-600">{result.name}</p>
                      <div className="mt-2">
                        <Badge variant={result.status}>{result.status}</Badge>
                      </div>
                    </div>
                    <span className="text-sm text-gray-500">
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
