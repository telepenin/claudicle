import Link from "next/link";
import { Activity, DollarSign, Hash, Layers } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DashboardCharts } from "@/components/dashboard-charts";
import { Badge } from "@/components/ui/badge";
import { formatCost, formatTokens, formatRelativeTime } from "@/lib/format";
import { getStats, getSessionList } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  let stats;
  let recentSessions;
  let error: string | undefined;

  try {
    [stats, recentSessions] = await Promise.all([
      getStats(),
      getSessionList({ page: 1, limit: 5 }),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !stats || !recentSessions) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-semibold">Dashboard</h1>
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-yellow-800">
          <p className="font-medium">ClickHouse not reachable</p>
          <p className="mt-1 text-sm">
            Make sure ClickHouse is running:{" "}
            <code className="rounded bg-yellow-100 px-1">
              docker compose up -d
            </code>
          </p>
          {error && (
            <p className="mt-2 font-mono text-xs text-yellow-700">{error}</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Sessions"
          value={stats.totals.sessions.toLocaleString()}
          icon={Layers}
        />
        <StatCard
          label="Events"
          value={stats.totals.events.toLocaleString()}
          icon={Activity}
        />
        <StatCard
          label="Total Cost"
          value={formatCost(stats.totals.cost)}
          icon={DollarSign}
        />
        <StatCard
          label="Total Tokens"
          value={formatTokens(stats.totals.tokens)}
          icon={Hash}
        />
      </div>

      <div className="mb-8">
        <DashboardCharts />
      </div>

      {recentSessions.sessions.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium">Recent Sessions</h2>
            <Link
              href="/sessions"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {recentSessions.sessions.map((s) => (
              <Link
                key={s.session_id}
                href={`/sessions/${s.session_id}`}
                className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm">
                    {s.session_id.slice(0, 12)}...
                  </span>
                  {s.model && (
                    <Badge variant="outline" className="font-mono text-xs">
                      {s.model}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{Number(s.event_count)} events</span>
                  {Number(s.total_cost) > 0 && (
                    <span>{formatCost(Number(s.total_cost))}</span>
                  )}
                  {Number(s.total_input_tokens) + Number(s.total_output_tokens) >
                    0 && (
                    <span>
                      {formatTokens(
                        Number(s.total_input_tokens) +
                          Number(s.total_output_tokens)
                      )}
                    </span>
                  )}
                  <span>{formatRelativeTime(s.started_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
