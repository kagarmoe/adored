import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
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
  const collectionRepo = new CollectionRepository(db);
  const membershipRepo = new MembershipRepository(db);

  const collection = await collectionRepo.findById(params.id);
  if (!collection) {
    redirect("/collections");
  }

  const members = await membershipRepo.findByCollection(params.id);
  const currentUserMembership = members.find((m) => m.userId === session.user!.id);
  const canManage = currentUserMembership?.role === "owner" || currentUserMembership?.canManageCollection;

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.id}` },
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
