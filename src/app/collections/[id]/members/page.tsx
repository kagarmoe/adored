import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionOwnerPage } from "@/lib/collection-access";
import { MemberController } from "@/server/api/members";
import { InvitationController } from "@/server/api/invitations";
import { AppLayout } from "@/components/layout";
import { Card } from "@/components/ui";
import { MemberList } from "@/features/collections/MemberList";
import { InviteForm } from "@/features/collections/InviteForm";

interface MembersPageProps {
  params: Promise<{ id: string }>;
}

export default async function MembersPage({ params }: MembersPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  // Owner-only page: members:manage = owner by role (purses-yqw). The owner gate
  // also covers the invitee-email PII surfaced by the pending rows below.
  const collection = await requireCollectionOwnerPage(db, id, session.user.id);

  const members = await MemberController.fromDb(db).listMembers(collection.id);
  const invitations = await InvitationController.fromDb(db).listByCollection(collection.id);
  const pending = invitations.filter((i) => i.status === "pending");

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
        { label: "People" },
      ]}
    >
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl text-ink sm:text-3xl">People</h1>
          <p className="max-w-2xl text-ink-soft">
            Sharing is an after-the-fact step — invite someone once your list feels ready.
          </p>
        </div>

        <Card padding="lg">
          <InviteForm collectionId={collection.id} />
        </Card>

        <MemberList members={members} pending={pending} canManage />
      </div>
    </AppLayout>
  );
}
