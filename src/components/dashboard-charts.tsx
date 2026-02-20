"use client";

import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { StatsResponse } from "@/lib/types";
import {
  FileText, Pencil, BookOpen, Terminal, FolderSearch, Search,
  Globe, Code, Wrench, Plug, CirclePlus, RefreshCw, ListTodo,
  MessageCircleQuestion, Map as MapIcon, LogOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ToolBadge, TOOL_COLORS, DEFAULT_TOOL_COLOR, MCP_TOOL_COLOR } from "@/components/conversation/tool-renderers";

const TOOL_ICONS: Record<string, LucideIcon> = {
  Write: FileText, Edit: Pencil, Read: BookOpen, Bash: Terminal,
  Glob: FolderSearch, Grep: Search, WebSearch: Search, WebFetch: Globe,
  Task: Code, TaskCreate: CirclePlus, TaskUpdate: RefreshCw,
  TaskList: ListTodo, TaskGet: ListTodo, TodoWrite: ListTodo,
  AskUserQuestion: MessageCircleQuestion,
  EnterPlanMode: MapIcon, ExitPlanMode: LogOut,
  Skill: Plug,
};

function ToolCell({ tool }: { tool: string }) {
  const isMcp = tool === "mcp_tool" || tool.startsWith("mcp__");
  const colors = isMcp ? MCP_TOOL_COLOR : (TOOL_COLORS[tool] ?? DEFAULT_TOOL_COLOR);
  const icon = isMcp ? Plug : (TOOL_ICONS[tool] ?? Wrench);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 border ${colors.border} ${colors.bg}`}>
      <ToolBadge label={tool} icon={icon} />
    </span>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function DashboardCharts({ data }: { data?: StatsResponse }) {
  const [stats, setStats] = useState<StatsResponse | null>(data ?? null);
  const [loading, setLoading] = useState(!data);

  useEffect(() => {
    if (data) {
      setStats(data);
      setLoading(false);
      return;
    }
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch((e) => console.error("Failed to fetch stats:", e))
      .finally(() => setLoading(false));
  }, [data]);

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="mb-4 h-5 w-32" />
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {stats.cost_over_time.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-4 text-sm font-medium text-muted-foreground">
              Cost (Last 30 Days)
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.cost_over_time}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) =>
                    new Date(d).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  }
                  className="text-xs"
                />
                <YAxis
                  tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                  className="text-xs"
                />
                <Tooltip
                  formatter={(v) => [`$${Number(v).toFixed(4)}`, "Cost"]}
                  labelFormatter={(d) => new Date(String(d)).toLocaleDateString()}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="oklch(0.646 0.222 41.116)"
                  fill="oklch(0.646 0.222 41.116 / 0.2)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {stats.tokens_over_time.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-4 text-sm font-medium text-muted-foreground">
              Tokens (Last 30 Days)
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.tokens_over_time}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) =>
                    new Date(d).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  }
                  className="text-xs"
                />
                <YAxis
                  tickFormatter={(v: number) => {
                    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
                    return String(v);
                  }}
                  className="text-xs"
                />
                <Tooltip
                  formatter={(v) => Number(v).toLocaleString()}
                  labelFormatter={(d) => new Date(String(d)).toLocaleDateString()}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="input_tokens"
                  name="Input"
                  stroke="oklch(0.6 0.118 184.704)"
                  fill="oklch(0.6 0.118 184.704 / 0.2)"
                />
                <Area
                  type="monotone"
                  dataKey="output_tokens"
                  name="Output"
                  stroke="oklch(0.828 0.189 84.429)"
                  fill="oklch(0.828 0.189 84.429 / 0.2)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {stats.events_by_type.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-4 text-sm font-medium text-muted-foreground">
              Events by Type
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={stats.events_by_type}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" className="text-xs" />
                <YAxis
                  type="category"
                  dataKey="event_name"
                  width={160}
                  className="text-xs"
                  tickFormatter={(v: string) => v.replace("claude_code.", "")}
                />
                <Tooltip />
                <Bar
                  dataKey="count"
                  fill="oklch(0.398 0.07 227.392)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {stats.top_models.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-4 text-sm font-medium text-muted-foreground">
              Top Models
            </h3>
            <div className="space-y-3">
              {stats.top_models.map((m) => (
                <div
                  key={m.model}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-mono text-xs">{m.model}</span>
                  <div className="flex gap-4 text-muted-foreground">
                    <span>{Number(m.count).toLocaleString()} calls</span>
                    {Number(m.cost) > 0 && (
                      <span>${Number(m.cost).toFixed(2)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {stats.top_tools.length > 0 && (
        <Card className="md:col-span-2">
          <CardContent className="p-6">
            <h3 className="mb-4 text-sm font-medium text-muted-foreground">
              Top Tools
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Tool</th>
                  <th className="pb-2 text-right font-medium">Calls</th>
                  <th className="pb-2 text-right font-medium">Min</th>
                  <th className="pb-2 text-right font-medium">Avg</th>
                  <th className="pb-2 text-right font-medium">Max</th>
                  <th className="pb-2 text-right font-medium">Success</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_tools.map((t) => {
                  const avgMs = Number(t.avg_duration_ms) || 0;
                  const minMs = Number(t.min_duration_ms) || 0;
                  const maxMs = Number(t.max_duration_ms) || 0;
                  const hasDuration = avgMs > 0;
                  const successPct = Number(t.success_pct);
                  const hasSuccess = !isNaN(successPct);
                  return (
                    <tr key={t.tool} className="border-b last:border-0">
                      <td className="py-2"><ToolCell tool={t.tool} /></td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {Number(t.count).toLocaleString()}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {hasDuration ? formatDuration(minMs) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {hasDuration ? formatDuration(avgMs) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {hasDuration ? formatDuration(maxMs) : "—"}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${!hasSuccess ? "text-muted-foreground" : successPct === 100 ? "text-muted-foreground" : successPct >= 90 ? "text-yellow-500" : "text-red-500"}`}>
                        {hasSuccess ? `${successPct.toFixed(0)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
