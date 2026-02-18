import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
      <Link
        href="/logs"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to logs
      </Link>

      <div className="mb-6">
        <h1 className="mb-2 text-xl font-semibold font-mono break-all">
          {id}
        </h1>
      </div>

      <LogConversationView sessionId={id} />
    </main>
  );
}
