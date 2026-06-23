import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionOwnerPage } from "@/lib/collection-access";
import { MemberController } from "@/server/api/members";
import { AppLayout } from "@/components/layout";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { MemberList } from "@/features/collections/MemberList";
import { InviteForm } from "@/features/collections/InviteForm";

interface MembersPageProps {
  params: { id: string };
}

export default async function MembersPage({ params }: MembersPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  // Owner-only page: members:manage = owner by role (purses-yqw).
  const collection = await requireCollectionOwnerPage(db, params.id, session.user.id);

  const members = await MemberController.fromDb(db).listMembers(collection.id);

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
        { label: "Members" },
      ]}
    >
      <div className="space-y-8">
        {/* Members Section */}
        <div>
          <SectionHeader title="Members" description={`${members.length} member${members.length !== 1 ? "s" : ""}`} />
          <MemberList members={members} canManage={true} />
        </div>

        {/* Invite Section */}
        <div>
          <SectionHeader title="Invite New Member" description="Add a new curator to this collection" />
          <InviteForm collectionId={collection.id} />
        </div>
      </div>
    </AppLayout>
  );
}
