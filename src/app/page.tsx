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
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl font-bold mb-2 text-gray-900">PurseInator</h1>
        <p className="text-xl text-gray-600 mb-8">sort what you love, let go of the rest</p>

        <p className="text-lg text-gray-700 mb-8">
          Curate your favorite collections with precision. Sort items into buckets, refine your preferences, and share your curated results.
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors h-12 flex items-center"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
