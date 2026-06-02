"use client";

import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

export function Header() {
  const { data: session } = useSession();

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-veil/85 backdrop-blur-md border-b border-line shadow-lift">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/collections" className="flex items-center gap-2">
          <h1 className="text-2xl font-medium tracking-tight text-ink">PurseInator</h1>
        </Link>

        {session?.user && (
          <div className="flex items-center gap-4">
            <div className="text-sm text-ink">
              <p className="font-medium">{session.user.name || session.user.email}</p>
            </div>
            <Button
              variant="ghost"
              size="md"
              onClick={() => signOut({ redirect: true, callbackUrl: "/login" })}
            >
              Sign out
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
