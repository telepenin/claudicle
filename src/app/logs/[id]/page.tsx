import { Suspense } from "react";
import { BackToLogsLink } from "@/components/back-to-logs-link";
import { LogConversationView } from "@/components/log-conversation";

export const dynamic = "force-dynamic";

export default async function LogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Suspense>
        <BackToLogsLink />
      </Suspense>

      <div className="mb-6">
        <h1 className="mb-2 text-xl font-semibold font-mono break-all">
          {id}
        </h1>
      </div>

      <LogConversationView sessionId={id} />
    </main>
  );
}
