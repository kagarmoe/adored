import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const session = await getSession();

  // Authenticated visitors skip the marketing landing and go straight to their
  // collections.
  if (session?.user) {
    redirect("/collections");
  }

  return (
    <main className="min-h-[100svh] flex flex-col items-center justify-center px-4 py-10 sm:p-6">
      <div className="max-w-md text-center sm:max-w-2xl">
        <h1 className="mb-3 text-4xl font-medium tracking-tight text-ink sm:text-5xl">Adored</h1>
        <p className="mb-6 text-lg text-ink-soft sm:mb-8 sm:text-xl">for the things you love</p>

        <p className="mb-8 text-base text-ink sm:text-lg">
          A quiet place to sit with your things, one at a time, and notice what you love. When you&apos;re ready, share the order you arrive at.
        </p>

        <div className="flex justify-center">
          <Link
            href="/login"
            className="flex h-12 w-full max-w-xs items-center justify-center rounded-lg bg-primary px-8 py-3 font-semibold text-primary-ink transition-colors hover:bg-primary-hover sm:w-auto"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
