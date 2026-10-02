"use client";

import React from "react";
import { Header } from "./Header";
import { Breadcrumbs } from "./Breadcrumbs";
import { PageContainer } from "./PageContainer";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface AppLayoutProps {
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  /** The page renders an ActionBar: reserve room so it never covers the last row or footer. */
  reserveActionBar?: boolean;
  children: React.ReactNode;
}

export function AppLayout({ breadcrumbs, actions, reserveActionBar, children }: AppLayoutProps) {
  return (
    <div className={`flex min-h-screen flex-col bg-ground ${reserveActionBar ? "pb-36 md:pb-0" : ""}`}>
      <Header />

      <main className="flex-1 pt-20">
        <PageContainer>
          {(breadcrumbs || actions) && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : <span />}
              {/* shrink-0: a long, scrolling breadcrumb must not squeeze or wrap
                  the action (e.g. "Pause") on a tablet-width row. The
                  bottom margin stays on Breadcrumbs so the 19 action-less pages
                  keep their exact spacing. */}
              {actions && (
                <div className="mb-6 flex w-full shrink-0 justify-start sm:w-auto sm:justify-end">
                  {actions}
                </div>
              )}
            </div>
          )}
          {children}
        </PageContainer>
      </main>

      <footer className="border-t border-hairline bg-surface dark:bg-ground py-4 text-center text-sm text-ink-soft">
        <p>Adored &middot; Find the things you love</p>
      </footer>
    </div>
  );
}
