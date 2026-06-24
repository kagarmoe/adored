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
  children: React.ReactNode;
}

export function AppLayout({ breadcrumbs, actions, children }: AppLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen bg-ground">
      <Header />

      <main className="flex-1 pt-20">
        <PageContainer>
          {(breadcrumbs || actions) && (
            <div className="flex items-center justify-between gap-4">
              {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : <span />}
              {/* shrink-0: a long, scrolling breadcrumb must not squeeze or wrap
                  the action (e.g. "Take a break") on a tablet-width row. The
                  bottom margin stays on Breadcrumbs so the 19 action-less pages
                  keep their exact spacing. */}
              {actions && <div className="shrink-0 mb-6">{actions}</div>}
            </div>
          )}
          {children}
        </PageContainer>
      </main>

      <footer className="border-t border-hairline bg-surface py-4 text-center text-sm text-ink-soft">
        <p>Adored &middot; take all the time you need</p>
      </footer>
    </div>
  );
}
