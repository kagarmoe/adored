import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { AppLayout } from "@/components/layout";
import { Card } from "@/components/ui";

interface SessionPageProps {
  params: { id: string; sessionId: string };
}

export default async function SortSessionPage({ params }: SessionPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const sessionRepo = new SessionRepository(db);
  const sortSession = await sessionRepo.findById(params.sessionId);

  if (!sortSession) {
    redirect(`/collections/${params.id}/sort`);
  }

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: "Sort", href: `/collections/${params.id}/sort` },
        { label: "Session" },
      ]}
    >
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sorting Session</h1>
          <p className="text-gray-600 mt-2">Goal: {sortSession.goal}</p>
          <p className="text-gray-600">Status: {sortSession.status}</p>
        </div>

        <Card padding="lg" className="text-center">
          <p className="text-gray-600 mb-4">
            This is a placeholder for the interactive sorting interface.
          </p>
          <p className="text-sm text-gray-500">
            Task 8: Active Sort Session requires complex state management for triage/pairwise modes.
            Integration with full preference and pairing logic will be completed in a follow-up phase.
          </p>
        </Card>
      </div>
    </AppLayout>
  );
}
