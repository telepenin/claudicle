"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Bot,
  Wrench,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Markdown } from "./markdown";
import { ContentBlocks, UsageInfo } from "./content-blocks";
import {
  groupIntoTurns,
  shortenModel,
  extractCwd,
  type Turn,
  type TaskTimelineItem,
} from "@/lib/turn-grouping";
import { formatDuration } from "@/lib/format";
import type { LogMessage } from "@/lib/types";

// ─── SubagentConversation ────────────────────────────────────────────────

export function SubagentConversation({ messages, cwd: parentCwd }: { messages: LogMessage[]; cwd?: string }) {
  const [expanded, setExpanded] = useState(false);

  const turns = useMemo(() => groupIntoTurns(messages), [messages]);
  const cwd = useMemo(() => extractCwd(messages) || parentCwd || "", [messages, parentCwd]);

  const stats = useMemo(() => {
    let turnCount = 0;
    let toolCalls = 0;
    for (const turn of turns) {
      if (turn.kind === "assistant_turn") {
        turnCount++;
        toolCalls += turn.contentBlocks.filter(
          (b) => b.type === "tool_use"
        ).length;
      }
      if (turn.kind === "user_prompt") turnCount++;
    }
    return { turnCount, toolCalls };
  }, [turns]);

  return (
    <div className="mt-2 border-l-2 border-indigo-400 ml-2 pl-3">
      <button
        className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Bot className="h-3 w-3" />
        <span className="font-medium">
          Subagent: {stats.turnCount} turns, {stats.toolCalls} tool calls
        </span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-3">
          {turns.map((turn, i) => {
            switch (turn.kind) {
              case "user_prompt":
                return <UserPromptCard key={i} turn={turn} />;
              case "assistant_turn":
                return <AssistantTurnCard key={i} turn={turn} cwd={cwd} />;
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

// ─── UserPromptCard ──────────────────────────────────────────────────────

export function UserPromptCard({
  turn,
}: {
  turn: Extract<Turn, { kind: "user_prompt" }>;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
        <span className="text-xs font-medium text-blue-600">You</span>
        <span className="text-xs text-muted-foreground">
          {new Date(turn.message.msg_timestamp).toLocaleTimeString()}
        </span>
      </div>
      <Card className="border-blue-200 bg-blue-50 py-0 gap-0">
        <CardContent className="p-4">
          {turn.content.length > 0 ? (
            <ContentBlocks
              blocks={turn.content}
              toolResults={new Map()}
            />
          ) : (
            <p className="text-sm text-muted-foreground italic">
              (empty message)
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── AssistantTurnCard ───────────────────────────────────────────────────

function computeTurnDuration(turn: Extract<Turn, { kind: "assistant_turn" }>): number | null {
  const start = new Date(turn.timestamp).getTime();
  let end = start;

  // Check last message timestamp
  const lastMsg = turn.messages[turn.messages.length - 1];
  if (lastMsg) {
    end = Math.max(end, new Date(lastMsg.msg_timestamp).getTime());
  }

  // Check tool result timestamps
  for (const result of turn.toolResults.values()) {
    if (result.timestamp) {
      end = Math.max(end, new Date(result.timestamp).getTime());
    }
  }

  const diff = end - start;
  return diff > 0 ? diff : null;
}

export function AssistantTurnCard({
  turn,
  taskToSubagent,
  subagentMap,
  taskTimeline,
  cwd,
}: {
  turn: Extract<Turn, { kind: "assistant_turn" }>;
  taskToSubagent?: Map<string, string>;
  subagentMap?: Map<string, LogMessage[]>;
  taskTimeline?: Map<string, TaskTimelineItem[]>;
  cwd?: string;
}) {
  const durationMs = useMemo(() => computeTurnDuration(turn), [turn]);

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <Bot className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Claude</span>
        <span className="text-xs text-muted-foreground">
          {new Date(turn.timestamp).toLocaleTimeString()}
        </span>
        {turn.model && (
          <Badge variant="outline" className="font-mono text-xs">
            {shortenModel(turn.model)}
          </Badge>
        )}
        {durationMs !== null && (
          <span className="text-xs text-muted-foreground">
            {formatDuration(durationMs)}
          </span>
        )}
        <UsageInfo usage={turn.usage} />
      </div>
      <Card className="py-0 gap-0">
        <CardContent className="p-4">
          {turn.contentBlocks.length > 0 ? (
            <ContentBlocks
              blocks={turn.contentBlocks}
              toolResults={turn.toolResults}
              taskToSubagent={taskToSubagent}
              subagentMap={subagentMap}
              SubagentConversation={SubagentConversation}
              taskTimeline={taskTimeline}
              cwd={cwd}
              model={turn.model}
            />
          ) : (
            <p className="text-sm text-muted-foreground italic">
              (empty response)
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── CompactSummaryBanner ────────────────────────────────────────────────

export function CompactSummaryBanner({
  turn,
}: {
  turn: Extract<Turn, { kind: "compact_summary" }>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-2">
      <button
        className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span>ℹ</span>
        <span className="font-medium">
          Context continued from previous conversation
        </span>
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>
      {expanded && turn.text && (
        <div className="mt-2 text-xs text-muted-foreground">
          <Markdown text={turn.text} />
        </div>
      )}
    </div>
  );
}

// ─── SkillLoadedBanner ───────────────────────────────────────────────────

export function SkillLoadedBanner({
  turn,
}: {
  turn: Extract<Turn, { kind: "skill_loaded" }>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 px-4 py-2">
      <button
        className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <Wrench className="h-3 w-3" />
        <span className="font-medium">
          Skill loaded: {turn.skillName}
        </span>
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>
      {expanded && turn.text && (
        <div className="mt-2 text-xs text-muted-foreground">
          <Markdown text={turn.text} />
        </div>
      )}
    </div>
  );
}

// ─── TurnSeparator ───────────────────────────────────────────────────────

export function TurnSeparator({
  turn,
}: {
  turn: Extract<Turn, { kind: "turn_separator" }>;
}) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">{formatDuration(turn.durationMs)}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
