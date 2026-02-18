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
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCost, formatTokens, formatRelativeTime } from "@/lib/format";
import type { SessionListResponse } from "@/lib/types";

export function SessionList() {
  const [data, setData] = useState<SessionListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/sessions?${params}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error("Failed to fetch sessions:", e);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sessions..."
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
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Events</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Started</TableHead>
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
                  No sessions found.
                </TableCell>
              </TableRow>
            ) : (
              data.sessions.map((s) => (
                <TableRow key={s.session_id}>
                  <TableCell>
                    <Link
                      href={`/sessions/${s.session_id}`}
                      className="font-mono text-sm text-blue-600 hover:underline"
                    >
                      {s.session_id.slice(0, 12)}...
                    </Link>
                  </TableCell>
                  <TableCell>
                    {s.model ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        {s.model}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(s.event_count)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(s.total_cost) > 0
                      ? formatCost(Number(s.total_cost))
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(s.total_input_tokens) + Number(s.total_output_tokens) > 0
                      ? formatTokens(
                          Number(s.total_input_tokens) +
                            Number(s.total_output_tokens)
                        )
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatRelativeTime(s.started_at)}
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
