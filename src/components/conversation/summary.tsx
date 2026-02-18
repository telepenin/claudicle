"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { groupIntoTurns, shortenModel } from "@/lib/turn-grouping";
import { formatDurationMinutes } from "@/lib/format";
import type { LogMessage } from "@/lib/types";

export function ConversationSummary({ messages }: { messages: LogMessage[] }) {
  const stats = useMemo(() => {
    const turns = groupIntoTurns(messages);
    let userPrompts = 0;
    let assistantTurns = 0;
    let toolCalls = 0;
    let model = "";

    let errors = 0;

    for (const turn of turns) {
      if (turn.kind === "user_prompt") userPrompts++;
      if (turn.kind === "assistant_turn") {
        assistantTurns++;
        if (!model && turn.model) model = turn.model;
        toolCalls += turn.contentBlocks.filter(
          (b) => b.type === "tool_use"
        ).length;
        for (const result of turn.toolResults.values()) {
          if (result.isError) errors++;
        }
      }
    }

    const first = messages[0]?.msg_timestamp;
    const last = messages[messages.length - 1]?.msg_timestamp;
    let durationMin = 0;
    if (first && last) {
      durationMin = Math.round(
        (new Date(last).getTime() - new Date(first).getTime()) / 60000
      );
    }

    return { userPrompts, assistantTurns, toolCalls, errors, model, durationMin };
  }, [messages]);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      {stats.model && (
        <Badge variant="outline" className="font-mono">
          {shortenModel(stats.model)}
        </Badge>
      )}
      <span>{stats.userPrompts} prompts</span>
      <span>{stats.assistantTurns} responses</span>
      {stats.toolCalls > 0 && <span>{stats.toolCalls} tool calls</span>}
      {stats.errors > 0 && <span className="text-red-600">{stats.errors} errors</span>}
      {stats.durationMin > 0 && <span>{formatDurationMinutes(stats.durationMin)} duration</span>}
    </div>
  );
}
