import { Suspense } from "react";
import { DashboardContent } from "@/components/dashboard-content";

export default function Home() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <Suspense>
        <DashboardContent />
      </Suspense>
    </main>
  );
}
