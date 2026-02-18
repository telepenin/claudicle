import { LogList } from "@/components/log-list";

export default function LogsPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Session Logs</h1>
      <LogList />
    </main>
  );
}
