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
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header />

      <main className="flex-1 pt-20">
        <PageContainer>
          {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
          {children}
        </PageContainer>
      </main>

      <footer className="border-t border-gray-200 bg-white py-4 text-center text-sm text-gray-600">
        <p>&copy; 2026 PurseInator. All rights reserved.</p>
      </footer>
    </div>
  );
}
