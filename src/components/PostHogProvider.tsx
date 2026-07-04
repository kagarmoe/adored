'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { useEffect, useRef, Suspense } from 'react';

if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    defaults: '2026-01-30',
    capture_exceptions: true,
    capture_pageview: false,
    debug: process.env.NODE_ENV === 'development',
  });
}

// Routes whose first dynamic segment is a secret token (invitation / share
// credential). We mask that segment so it never reaches PostHog.
const TOKEN_ROUTE_PREFIXES = ['/invitations/', '/shared-results/'];

function redactPathname(pathname: string): string {
  for (const prefix of TOKEN_ROUTE_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      const rest = pathname.slice(prefix.length);
      const trailing = rest.slice(rest.indexOf('/') === -1 ? rest.length : rest.indexOf('/'));
      return `${prefix}[redacted]${trailing}`;
    }
  }
  return pathname;
}

function PostHogPageView() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) {
      // Send pathname only (dynamic secrets masked); never the query string,
      // which can also carry tokens.
      posthog.capture('$pageview', {
        $current_url: window.origin + redactPathname(pathname),
      });
    }
  }, [pathname]);

  return null;
}

function PostHogAuthSync() {
  const { data: session, isPending } = useSession();
  // better-auth exposes { data, isPending } rather than a status string. Derive
  // the same three states: pending (skip), authenticated (data.user present),
  // unauthenticated (settled with no user).
  const status = isPending
    ? 'loading'
    : session?.user
      ? 'authenticated'
      : 'unauthenticated';
  const prevStatus = useRef(status);

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      // Identify by opaque user id only — no email/name traits reach PostHog.
      posthog.identify(session.user.id);
    } else if (status === 'unauthenticated' && prevStatus.current === 'authenticated') {
      posthog.reset();
    }
    prevStatus.current = status;
  }, [session, status]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      <PostHogAuthSync />
      {children}
    </PHProvider>
  );
}
