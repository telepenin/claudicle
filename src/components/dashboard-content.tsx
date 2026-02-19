"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Activity, DollarSign, Hash, Layers, MessageSquare } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DashboardCharts } from "@/components/dashboard-charts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCost, formatTokens, formatRelativeTime, extractProject } from "@/lib/format";
import type { StatsResponse, DimensionValues, DashboardFilters, LogSessionSummary } from "@/lib/types";

const DIMENSION_KEYS = ["project", "environment", "team", "developer"] as const;
const DIMENSION_LABELS: Record<string, string> = {
  project: "Project",
  environment: "Environment",
  team: "Team",
  developer: "Developer",
};

export function DashboardContent() {
  const [dimensions, setDimensions] = useState<DimensionValues | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [recentLogs, setRecentLogs] = useState<LogSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dimensions")
      .then((r) => r.json())
      .then((data) => setDimensions(data))
      .catch(() => {});
  }, []);

  const fetchStats = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    for (const key of DIMENSION_KEYS) {
      const v = filters[key];
      if (v) params.set(key, v);
    }
    const qs = params.toString();
    const statsUrl = `/api/stats${qs ? `?${qs}` : ""}`;

    Promise.all([
      fetch(statsUrl).then((r) => {
        if (!r.ok) throw new Error(`Stats: ${r.status}`);
        return r.json();
      }),
      fetch("/api/logs?limit=5").then((r) => {
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
  }, [filters]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleFilterChange = (key: keyof DashboardFilters, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) {
        next[key] = value;
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const dimensionArrays: Record<string, string[]> = {
    project: dimensions?.projects ?? [],
    environment: dimensions?.environments ?? [],
    team: dimensions?.teams ?? [],
    developer: dimensions?.developers ?? [],
  };

  const visibleDimensions = DIMENSION_KEYS.filter(
    (key) => dimensionArrays[key].length > 0
  );

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
      {visibleDimensions.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-3">
          {visibleDimensions.map((key) => (
            <select
              key={key}
              value={filters[key] ?? ""}
              onChange={(e) =>
                handleFilterChange(key, e.target.value)
              }
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              <option value="">All {DIMENSION_LABELS[key]}s</option>
              {dimensionArrays[key].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ))}
        </div>
      )}

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
