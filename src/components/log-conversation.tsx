"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Download, Copy, Check } from "lucide-react";
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
  const [copied, setCopied] = useState(false);
  const [copiedResume, setCopiedResume] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const live = searchParams.get("live") === "1";
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

  // SSE live tail
  useEffect(() => {
    if (!live || !data || data.messages.length === 0) return;

    const lastTs = data.messages[data.messages.length - 1].msg_timestamp;
    const es = new EventSource(
      `/api/logs/${sessionId}/stream?after=${encodeURIComponent(lastTs)}`
    );

    es.onmessage = (event) => {
      try {
        const newMessages: LogMessage[] = JSON.parse(event.data);
        if (newMessages.length > 0) {
          setData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              messages: [...prev.messages, ...newMessages],
            };
          });
          // Auto-scroll to bottom
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // EventSource will auto-reconnect; nothing to do
    };

    return () => es.close();
  }, [live, sessionId, data?.messages.length]);

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

        {/* Live toggle */}
        <button
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            if (live) {
              params.delete("live");
            } else {
              params.set("live", "1");
            }
            const qs = params.toString();
            router.push(qs ? `${pathname}?${qs}` : pathname);
          }}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
            live
              ? "border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              live ? "animate-pulse bg-green-500" : "bg-muted-foreground/40"
            }`}
          />
          Live
        </button>

        {/* Download archive */}
        <div className="flex items-center gap-1">
          <a
            href={`/api/logs/${sessionId}/archive`}
            download
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            Download .tar.gz
          </a>
          <button
            title={`curl -f ${typeof window !== "undefined" ? window.location.origin : ""}/api/logs/${sessionId}/archive | tar -xz -C ~/.claude/projects/`}
            onClick={() => {
              const cmd = `curl -f ${window.location.origin}/api/logs/${sessionId}/archive | tar -xz -C ~/.claude/projects/`;
              navigator.clipboard.writeText(cmd);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied!" : "Copy curl"}
          </button>
          <button
            title={`curl -f ${typeof window !== "undefined" ? window.location.origin : ""}/api/logs/${sessionId}/archive | tar -xz -C ~/.claude/projects/ && claude --resume ${sessionId}`}
            onClick={() => {
              const cmd = `curl -f ${window.location.origin}/api/logs/${sessionId}/archive | tar -xz -C ~/.claude/projects/ && claude --resume ${sessionId}`;
              navigator.clipboard.writeText(cmd);
              setCopiedResume(true);
              setTimeout(() => setCopiedResume(false), 2000);
            }}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {copiedResume ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedResume ? "Copied!" : "Copy resume"}
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
      <div ref={bottomRef} />
    </div>
  );
}
