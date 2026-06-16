import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
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
  const collection = await requireCollectionAccess(db, params.id, session.user.id);
  const membershipRepo = new MembershipRepository(db);

  const members = await membershipRepo.findByCollection(collection.id);
  const currentUserMembership = members.find((m) => m.userId === session.user!.id);
  const canManage = currentUserMembership?.role === "owner" || currentUserMembership?.canManageCollection;

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
          <MemberList members={members} canManage={canManage} />
        </div>

        {/* Invite Section */}
        {canManage && (
          <div>
            <SectionHeader title="Invite New Member" description="Add a new curator to this collection" />
            <InviteForm collectionId={collection.id} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
