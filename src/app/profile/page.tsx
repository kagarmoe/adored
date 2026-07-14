import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { UserController } from "@/server/api/users";
import { AppLayout } from "@/components/layout";
import { ProfileForm } from "@/features/profile/ProfileForm";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const user = await UserController.fromDb(getDb()).getCurrentUser(session.user.id);

  return (
    <AppLayout breadcrumbs={[{ label: "Profile" }]}>
      <div className="mx-auto w-full max-w-2xl space-y-6 sm:space-y-8">
        <h1 className="text-2xl text-ink sm:text-3xl">Your profile</h1>
        <ProfileForm initialName={user.name ?? null} email={user.email} />
      </div>
    </AppLayout>
  );
}
