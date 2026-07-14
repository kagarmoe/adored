import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { ThemeScript } from "@/components/theme/theme-script";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Playfair Display (display) for the tender moments; Inter (body) for everything
// functional. Exposed as CSS variables consumed by globals.css.
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Adored",
  description: "Curate what you love",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${playfair.variable} ${inter.variable}`}
    >
      <body className="min-h-screen" suppressHydrationWarning>
        <ThemeScript />
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
