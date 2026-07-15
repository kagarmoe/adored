"use client";

import { useCallback, useEffect, useState } from "react";
import { createAuthClient } from "better-auth/react";

interface ClientSession {
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
}

// The better-auth browser client. Points at the /api/auth mount that
// auth-server.ts serves (NextAuth is retired — better-auth owns /api/auth now).
// We build the baseURL from the live origin at call time so it works on
// localhost, preview, and prod without an env var — better-auth only needs the
// origin + basePath.
//
// Adored supports Google login only. There is NO SessionProvider:
// better-auth's useSession is a hook backed by a nanostore, so the old NextAuth
// <SessionProvider> wrapper is gone.
//
// In the browser we use the live origin. During SSR/prerender there is no
// window; better-auth's client still parses baseURL as an absolute URL at
// construction, so we hand it a valid absolute placeholder (never actually
// fetched server-side — these are "use client" call sites). At runtime in the
// browser the origin branch always wins.
const baseURL =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/auth`
    : "http://localhost/api/auth";

export const authClient = createAuthClient({
  baseURL,
});

export function isClientDevAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_AUTH_BYPASS === "1";
}

async function readDevSession(): Promise<ClientSession | null> {
  const response = await fetch("/api/users/me");
  if (!response.ok) return null;
  const user = await response.json();
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  };
}

function useDevSession() {
  const [data, setData] = useState<ClientSession | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setIsPending(true);
    try {
      const session = await readDevSession();
      setData(session);
      setError(null);
      return { data: session, error: null };
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error("Unable to read dev session");
      setData(null);
      setError(nextError);
      return { data: null, error: nextError };
    } finally {
      setIsPending(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readDevSession()
      .then((session) => {
        if (cancelled) return;
        setData(session);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setData(null);
        setError(err instanceof Error ? err : new Error("Unable to read dev session"));
      })
      .finally(() => {
        if (!cancelled) setIsPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, isPending, error, refetch };
}

// Thin re-exports so call sites import from one place and never reach for the
// old NextAuth react client again.
export const useSession = isClientDevAuthBypassEnabled()
  ? useDevSession
  : authClient.useSession;
export const { signIn, signOut } = authClient;
