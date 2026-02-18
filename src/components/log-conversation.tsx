"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import type { LogConversation, LogMessage } from "@/lib/types";
import {
  groupIntoTurns,
  splitMainAndSubagent,
  buildTaskToSubagentMap,
  buildTaskTimeline,
  extractCwd,
} from "@/lib/turn-grouping";
import {
  UserPromptCard,
  AssistantTurnCard,
  CompactSummaryBanner,
  SkillLoadedBanner,
  TurnSeparator,
} from "./conversation/turn-cards";
import { ConversationSummary } from "./conversation/summary";
import { RawJsonlView } from "./conversation/raw-view";

// ─── Main component ───────────────────────────────────────────────────────

type ViewMode = "rendered" | "raw";

export function LogConversationView({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<LogConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const viewMode: ViewMode = searchParams.get("view") === "raw" ? "raw" : "rendered";

  const setViewMode = useCallback((mode: ViewMode) => {
    const params = new URLSearchParams(searchParams.toString());
    if (mode === "raw") {
      params.set("view", "raw");
    } else {
      params.delete("view");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [searchParams, router, pathname]);

  useEffect(() => {
    fetch(`/api/logs/${sessionId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
        } else {
          setData(json);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sessionId]);


  const { mainMessages, subagentMap } = useMemo(() => {
    if (!data) return { mainMessages: [], subagentMap: new Map<string, LogMessage[]>() };
    return splitMainAndSubagent(data.messages);
  }, [data]);

  const turns = useMemo(() => {
    return groupIntoTurns(mainMessages);
  }, [mainMessages]);

  const taskToSubagent = useMemo(() => {
    if (subagentMap.size === 0) return new Map<string, string>();
    return buildTaskToSubagentMap(mainMessages, subagentMap);
  }, [mainMessages, subagentMap]);

  const taskTimeline = useMemo(() => {
    return buildTaskTimeline(turns);
  }, [turns]);

  const cwd = useMemo(() => extractCwd(mainMessages), [mainMessages]);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-destructive">Failed to load conversation: {error}</p>
    );
  }

  if (!data || data.messages.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        No log messages found for this session.
      </p>
    );
  }


  return (
    <div>
      <ConversationSummary messages={mainMessages} />

      {/* Controls bar */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        {/* Rendered / Raw toggle */}
        <div className="inline-flex rounded-lg border bg-muted p-0.5">
          <button
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === "rendered"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setViewMode("rendered")}
          >
            Rendered
          </button>
          <button
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === "raw"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setViewMode("raw")}
          >
            Raw JSONL
          </button>
        </div>

      </div>

      {/* Content */}
      {viewMode === "raw" ? (
        <RawJsonlView messages={mainMessages} />
      ) : (
        <div className="space-y-4">
          {turns.map((turn, i) => {
            switch (turn.kind) {
              case "user_prompt":
                return <UserPromptCard key={i} turn={turn} />;
              case "assistant_turn":
                return (
                  <AssistantTurnCard
                    key={i}
                    turn={turn}
                    taskToSubagent={taskToSubagent}
                    subagentMap={subagentMap}
                    taskTimeline={taskTimeline}
                    cwd={cwd}
                  />
                );
              case "compact_summary":
                return <CompactSummaryBanner key={i} turn={turn} />;
              case "skill_loaded":
                return <SkillLoadedBanner key={i} turn={turn} />;
              case "turn_separator":
                return <TurnSeparator key={i} turn={turn} />;
            }
          })}
        </div>
      )}
    </div>
  );
}
