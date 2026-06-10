import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const session = await getSession();

  // If authenticated, redirect to collections
  if (session?.user) {
    redirect("/collections");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-ground">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl font-medium tracking-tight mb-3 text-ink">PurseInator</h1>
        <p className="text-xl text-ink-soft mb-8">for the things you love</p>

        <p className="text-lg text-ink mb-8">
          A quiet place to sit with your things, one at a time, and notice what you love. When you&apos;re ready, share the order you arrive at.
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="bg-primary hover:bg-primary-hover text-primary-ink font-semibold py-3 px-8 rounded-lg transition-colors h-12 flex items-center"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
