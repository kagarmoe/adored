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

export function AppLayout({ breadcrumbs, children }: AppLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen bg-ground">
      <Header />

      <main className="flex-1 pt-20">
        <PageContainer>
          {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
          {children}
        </PageContainer>
      </main>

      <footer className="border-t border-hairline bg-surface py-4 text-center text-sm text-ink-soft">
        <p>PurseInator &middot; take all the time you need</p>
      </footer>
    </div>
  );
}
