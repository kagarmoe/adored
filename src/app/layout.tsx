import type { Metadata } from "next";
import { SessionProviderWrapper } from "@/components/layout/SessionProviderWrapper";
import "./globals.css";

export const metadata: Metadata = {
  title: "PurseInator",
  description: "Curate what you love",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased min-h-screen bg-gray-50">
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}
