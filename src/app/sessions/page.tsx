import { SessionList } from "@/components/session-list";

export default function SessionsPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Sessions</h1>
      <SessionList />
    </main>
  );
}
