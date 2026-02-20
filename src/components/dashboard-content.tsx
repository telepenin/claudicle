"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Activity, DollarSign, Hash, Layers, MessageSquare } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DashboardCharts } from "@/components/dashboard-charts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCost, formatTokens, formatRelativeTime, extractProject } from "@/lib/format";
import { useGlobalFilters } from "@/lib/use-global-filters";
import type { StatsResponse, LogSessionSummary } from "@/lib/types";

export function DashboardContent() {
  const { filterQueryString } = useGlobalFilters();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [recentLogs, setRecentLogs] = useState<LogSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(() => {
    setLoading(true);
    setError(null);
    const statsUrl = `/api/stats${filterQueryString ? `?${filterQueryString}` : ""}`;

    Promise.all([
      fetch(statsUrl).then((r) => {
        if (!r.ok) throw new Error(`Stats: ${r.status}`);
        return r.json();
      }),
      fetch(`/api/logs?limit=5${filterQueryString ? `&${filterQueryString}` : ""}`).then((r) => {
        if (!r.ok) throw new Error(`Logs: ${r.status}`);
        return r.json();
      }),
    ])
      .then(([statsData, logsData]) => {
        setStats(statsData);
        setRecentLogs(logsData.sessions ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filterQueryString]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (error && !stats) {
    return (
      <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-yellow-800">
        <p className="font-medium">ClickHouse not reachable</p>
        <p className="mt-1 text-sm">
          Make sure ClickHouse is running:{" "}
          <code className="rounded bg-yellow-100 px-1">
            docker compose up -d
          </code>
        </p>
        <p className="mt-2 font-mono text-xs text-yellow-700">{error}</p>
      </div>
    );
  }

  return (
    <>
      {loading && !stats ? (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : stats ? (
        <>
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
            <DashboardCharts data={stats} />
          </div>
        </>
      ) : null}

      {recentLogs.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium">Recent Logs</h2>
            <Link
              href="/logs"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {recentLogs.map((s) => (
              <Link
                key={s.session_id}
                href={`/logs/${s.session_id}`}
                className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm">
                    {s.session_id.slice(0, 12)}...
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {extractProject(s.project_path)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {Number(s.message_count)}
                  </span>
                  <span>{formatRelativeTime(s.first_timestamp)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
