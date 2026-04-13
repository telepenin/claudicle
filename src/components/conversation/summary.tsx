"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { groupIntoTurns, shortenModel, parseMessage } from "@/lib/turn-grouping";
import { formatDurationMinutes, formatCost, formatTokens } from "@/lib/format";
import type { LogMessage, SessionCost } from "@/lib/types";

// Per-million-token pricing
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  opus:   { input: 15,   output: 75,  cacheRead: 1.875, cacheWrite: 18.75 },
  sonnet: { input: 3,    output: 15,  cacheRead: 0.375, cacheWrite: 3.75 },
  haiku:  { input: 0.80, output: 4,   cacheRead: 0.10,  cacheWrite: 1.00 },
};

function getPricing(model: string) {
  const m = model.toLowerCase();
  if (m.includes("opus")) return MODEL_PRICING.opus;
  if (m.includes("sonnet")) return MODEL_PRICING.sonnet;
  if (m.includes("haiku")) return MODEL_PRICING.haiku;
  return MODEL_PRICING.sonnet; // default fallback
}

/** Compute cost from JSONL usage fields embedded in assistant messages. */
function computeCostFromMessages(messages: LogMessage[]): SessionCost {
  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let apiCalls = 0;
  const seenMsgIds = new Set<string>();

  for (const msg of messages) {
    if (msg.msg_type !== "assistant") continue;
    const { usage, model, messageId } = parseMessage(msg.raw);
    if (!usage || !usage.output_tokens) continue;
    // Deduplicate — same API response can span multiple JSONL lines
    if (messageId) {
      if (seenMsgIds.has(messageId)) continue;
      seenMsgIds.add(messageId);
    }

    const pricing = getPricing(model ?? "");
    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;

    totalCost +=
      (input * pricing.input +
        output * pricing.output +
        cacheRead * pricing.cacheRead +
        cacheWrite * pricing.cacheWrite) / 1_000_000;
    totalInput += input + cacheRead + cacheWrite;
    totalOutput += output;
    apiCalls++;
  }

  return { cost_usd: totalCost, input_tokens: totalInput, output_tokens: totalOutput, api_calls: apiCalls };
}

export function ConversationSummary({ messages, cost }: { messages: LogMessage[]; cost?: SessionCost }) {
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

  // Use OTel cost if available, otherwise compute from JSONL usage
  const effectiveCost = useMemo(() => {
    if (cost) return cost;
    const computed = computeCostFromMessages(messages);
    return computed.api_calls > 0 ? computed : undefined;
  }, [cost, messages]);

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
      {effectiveCost && (
        <>
          <span className="font-medium text-foreground">{formatCost(effectiveCost.cost_usd)}</span>
          <span>{formatTokens(effectiveCost.input_tokens + effectiveCost.output_tokens)} tokens</span>
          <span>{effectiveCost.api_calls} API calls</span>
        </>
      )}
    </div>
  );
}
