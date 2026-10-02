"use client";

import { useSession, signOut } from "@/lib/auth-client";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function Header() {
  const { data: session } = useSession();
  const router = useRouter();

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-glass-strong backdrop-blur-md border-b border-rim shadow-lift">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/collections" className="flex items-center" aria-label="Adored home">
          <span className="font-display text-xl text-ink">Adored</span>
        </Link>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          {session?.user && (
            <>
              <Link
                href="/profile"
                className="flex h-11 items-center rounded-control px-2 text-sm text-ink-soft transition-colors hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
              >
                {session.user.name || "Your profile"}
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  router.push("/login");
                }}
                className="h-11 rounded-control px-2 text-sm text-ink-soft transition-colors hover:text-ink"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
