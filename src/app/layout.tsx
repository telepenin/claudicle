import type { Metadata } from "next";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { FilterBar } from "@/components/filter-bar";
import { ScrollToTop } from "@/components/scroll-to-top";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claudicle",
  description: "The chronicles of Claude — collect and visualize Claude Code session telemetry",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">
        <Header />
        <Suspense>
          <FilterBar />
        </Suspense>
        {children}
        <ScrollToTop />
      </body>
    </html>
  );
}
