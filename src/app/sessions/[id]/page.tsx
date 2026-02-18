import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSessionDetail } from "@/lib/queries";
import { formatCost, formatTokens, formatRelativeTime } from "@/lib/format";
import { EventTimeline } from "@/components/event-timeline";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail;
  try {
    detail = await getSessionDetail(id);
  } catch {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-destructive">
          Failed to load session. Is ClickHouse running?
        </p>
      </main>
    );
  }

  const { summary, events } = detail;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link
        href="/sessions"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sessions
      </Link>

      <div className="mb-6">
        <h1 className="mb-2 text-xl font-semibold font-mono break-all">
          {id}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {summary.model && (
            <Badge variant="outline" className="font-mono">
              {summary.model}
            </Badge>
          )}
          <span>{summary.event_count} events</span>
          {Number(summary.total_cost) > 0 && (
            <span>{formatCost(Number(summary.total_cost))}</span>
          )}
          {(Number(summary.total_input_tokens) > 0 ||
            Number(summary.total_output_tokens) > 0) && (
            <span>
              {formatTokens(Number(summary.total_input_tokens))} in /{" "}
              {formatTokens(Number(summary.total_output_tokens))} out
            </span>
          )}
          {summary.started_at && (
            <span>Started {formatRelativeTime(summary.started_at)}</span>
          )}
        </div>
      </div>

      <EventTimeline events={events} />
    </main>
  );
}
