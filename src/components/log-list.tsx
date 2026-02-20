"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Bot,
  Ellipsis,
  GitBranch,
  AlertCircle,
  Plug,
} from "lucide-react";
import { formatRelativeTime, extractProject } from "@/lib/format";
import { useGlobalFilters } from "@/lib/use-global-filters";
import type { LogListResponse } from "@/lib/types";

export function LogList() {
  const { filterQueryString } = useGlobalFilters();
  const [data, setData] = useState<LogListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) params.set("search", search);
      if (filterQueryString) {
        const filterParams = new URLSearchParams(filterQueryString);
        filterParams.forEach((v, k) => params.set(k, v));
      }
      const res = await fetch(`/api/logs?${params}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error("Failed to fetch logs:", e);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterQueryString]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by session ID or project path..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session ID</TableHead>
              <TableHead>Project</TableHead>
              <TableHead className="text-right">Messages</TableHead>
              <TableHead className="text-right">Breakdown</TableHead>
              <TableHead className="text-right">Started</TableHead>
              <TableHead className="text-right">Last active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data || data.sessions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  No logs found.
                </TableCell>
              </TableRow>
            ) : (
              data.sessions.map((s) => (
                <TableRow key={s.session_id}>
                  <TableCell>
                    <Link
                      href={`/logs/${s.session_id}`}
                      className="font-mono text-sm text-blue-600 hover:underline"
                    >
                      {s.session_id.slice(0, 12)}...
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {extractProject(s.project_path)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(s.message_count)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {Number(s.user_count) > 0 && (
                        <Badge
                          variant="secondary"
                          className="gap-1 text-xs font-normal"
                          title="User messages"
                        >
                          <MessageSquare className="h-3 w-3" />
                          {Number(s.user_count)}
                        </Badge>
                      )}
                      {Number(s.assistant_count) > 0 && (
                        <Badge
                          variant="secondary"
                          className="gap-1 text-xs font-normal"
                          title="Assistant messages"
                        >
                          <Bot className="h-3 w-3" />
                          {Number(s.assistant_count)}
                        </Badge>
                      )}
                      {Number(s.tool_count) > 0 && (
                        <Badge
                          variant="secondary"
                          className="gap-1 text-xs font-normal"
                          title="Other messages (progress, system, etc.)"
                        >
                          <Ellipsis className="h-3 w-3" />
                          {Number(s.tool_count)}
                        </Badge>
                      )}
                      {Number(s.subagent_count) > 0 && (
                        <Badge
                          variant="secondary"
                          className="gap-1 text-xs font-normal text-indigo-600"
                          title="Subagents spawned"
                        >
                          <GitBranch className="h-3 w-3" />
                          {Number(s.subagent_count)}
                        </Badge>
                      )}
                      {Number(s.mcp_tool_count) > 0 && (
                        <Badge
                          variant="secondary"
                          className="gap-1 text-xs font-normal text-emerald-600"
                          title="MCP tool calls"
                        >
                          <Plug className="h-3 w-3" />
                          {Number(s.mcp_tool_count)}
                        </Badge>
                      )}
                      {Number(s.error_count) > 0 && (
                        <Badge
                          variant="secondary"
                          className="gap-1 text-xs font-normal text-red-600"
                          title="Tool errors"
                        >
                          <AlertCircle className="h-3 w-3" />
                          {Number(s.error_count)}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatRelativeTime(s.first_timestamp)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatRelativeTime(s.last_timestamp)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0} sessions total
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
