"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  Brain,
  AlertCircle,
  Wrench,
} from "lucide-react";
import { Markdown, CollapsibleContent } from "./markdown";
import {
  renderToolCallContent,
  TOOL_COLORS,
  DEFAULT_TOOL_COLOR,
  SELF_RENDERING_TOOLS,
} from "./tool-renderers";
import type { ParsedContent, ToolResultInfo } from "@/lib/turn-grouping";
import { countLines, extractToolResultText } from "@/lib/turn-grouping";
import type { LogMessage } from "@/lib/types";

// ─── ThinkingBlock ───────────────────────────────────────────────────────

function ThinkingBlock({ text }: { text: string }) {
  const lines = countLines(text);
  const [expanded, setExpanded] = useState(lines <= 20);

  return (
    <div className="my-2 border-l-2 border-gray-300 pl-3 opacity-70">
      <button
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-1"
        onClick={() => setExpanded(!expanded)}
      >
        <Brain className="h-3 w-3" />
        <span className="font-medium">Thinking</span>
        {!expanded && (
          <span className="text-muted-foreground">({lines} lines)</span>
        )}
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>
      {expanded && <Markdown text={text} />}
    </div>
  );
}

// ─── ToolUseBlock ────────────────────────────────────────────────────────

export function ToolUseBlock({
  block,
  resultInfo,
  subagentMessages,
  SubagentConversation,
}: {
  block: ParsedContent;
  resultInfo?: ToolResultInfo;
  subagentMessages?: LogMessage[];
  SubagentConversation?: React.ComponentType<{ messages: LogMessage[] }>;
}) {
  const name = block.name ?? "tool";
  const input = (block.input as Record<string, unknown>) ?? {};
  const [showResult, setShowResult] = useState(false);

  const colors = TOOL_COLORS[name] ?? DEFAULT_TOOL_COLOR;
  const borderClass = resultInfo?.isError ? "border-red-400" : colors.border;
  const selfRendering = SELF_RENDERING_TOOLS.has(name);

  return (
    <div className={`my-2 border-l-2 ${borderClass} px-3 py-1 rounded-r-md ${colors.bg}`}>
      {renderToolCallContent(
        name,
        input,
        selfRendering ? resultInfo?.content : undefined,
        name === "Task" ? subagentMessages : undefined,
        name === "Task" ? SubagentConversation : undefined,
      )}
      {resultInfo && !selfRendering && (
        <div className="mt-1.5">
          {resultInfo.content ? (
            <>
              <button
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowResult(!showResult)}
              >
                {showResult ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <span>
                  {resultInfo.isError ? "Error" : "Result"}
                  {` (${countLines(resultInfo.content)} lines)`}
                </span>
                {resultInfo.isError && (
                  <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                    error
                  </Badge>
                )}
              </button>
              {showResult && (
                <div className="mt-1 rounded-md bg-background">
                  <CollapsibleContent
                    text={resultInfo.content}
                    maxLines={20}
                    defaultOpen={true}
                  />
                </div>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              {resultInfo.isError ? "Error (no output)" : "Done (no output)"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ToolResultBlock ─────────────────────────────────────────────────────

function ToolResultBlock({ block }: { block: ParsedContent }) {
  const isError = block.is_error === true;
  const text = extractToolResultText(block);
  const lines = countLines(text);
  const borderClass = isError ? "border-red-400" : "border-green-400";

  return (
    <div className={`my-2 border-l-2 ${borderClass} pl-3 py-1`}>
      <div className="flex items-center gap-2 mb-1">
        {isError ? (
          <AlertCircle className="h-3 w-3 text-red-600" />
        ) : (
          <Wrench className="h-3 w-3 text-green-600" />
        )}
        <span className="font-mono text-xs text-muted-foreground">
          {block.tool_name ?? block.name ?? "result"}
        </span>
        {isError && (
          <Badge variant="destructive" className="text-xs">
            error
          </Badge>
        )}
        {text && lines > 1 && (
          <span className="text-xs text-muted-foreground">
            ({lines} lines)
          </span>
        )}
      </div>
      {text && (
        <CollapsibleContent
          text={text}
          maxLines={20}
          defaultOpen={lines < 10}
        />
      )}
    </div>
  );
}

// ─── ContentBlocks ───────────────────────────────────────────────────────

export function ContentBlocks({
  blocks,
  toolResults,
  taskToSubagent,
  subagentMap,
  SubagentConversation,
}: {
  blocks: ParsedContent[];
  toolResults: Map<string, ToolResultInfo>;
  taskToSubagent?: Map<string, string>;
  subagentMap?: Map<string, LogMessage[]>;
  SubagentConversation?: React.ComponentType<{ messages: LogMessage[] }>;
}) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === "thinking" && block.thinking) {
          return <ThinkingBlock key={i} text={block.thinking} />;
        }
        if (block.type === "tool_use") {
          const result = block.id
            ? toolResults.get(block.id)
            : undefined;
          let subMsgs: LogMessage[] | undefined;
          if (block.name === "Task" && block.id && taskToSubagent && subagentMap) {
            const agentId = taskToSubagent.get(block.id);
            if (agentId) {
              subMsgs = subagentMap.get(agentId);
            }
          }
          return (
            <ToolUseBlock
              key={i}
              block={block}
              resultInfo={result}
              subagentMessages={subMsgs}
              SubagentConversation={SubagentConversation}
            />
          );
        }
        if (block.type === "tool_result") {
          return <ToolResultBlock key={i} block={block} />;
        }
        if ((block.type === "text" || !block.type) && block.text) {
          return <Markdown key={i} text={block.text} />;
        }
        return null;
      })}
    </>
  );
}

// ─── UsageInfo ───────────────────────────────────────────────────────────

export function UsageInfo({ usage }: { usage: ParsedContent["usage"] }) {
  if (!usage) return null;
  const parts: string[] = [];
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;

  if (cacheRead > 0) parts.push(`${(cacheRead / 1000).toFixed(1)}k cached`);
  if (cacheCreate > 0)
    parts.push(`${(cacheCreate / 1000).toFixed(1)}k new cache`);
  if (input > 0 && cacheRead === 0 && cacheCreate === 0)
    parts.push(`${input} in`);
  if (output > 0) parts.push(`${output} out`);

  if (parts.length === 0) return null;
  return (
    <span className="text-xs text-muted-foreground">{parts.join(" / ")}</span>
  );
}
