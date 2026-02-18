"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  Brain,
  AlertCircle,
  Wrench,
  ListTodo,
} from "lucide-react";
import { Markdown, CollapsibleContent } from "./markdown";
import {
  renderToolCallContent,
  TOOL_COLORS,
  DEFAULT_TOOL_COLOR,
  SELF_RENDERING_TOOLS,
} from "./tool-renderers";
import type { ParsedContent, ToolResultInfo, TaskTimelineItem } from "@/lib/turn-grouping";
import { countLines, extractToolResultText } from "@/lib/turn-grouping";
import type { LogMessage } from "@/lib/types";

const TASK_TOOL_NAMES = new Set([
  "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "TaskStop", "TodoWrite",
]);

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
  cwd,
}: {
  block: ParsedContent;
  resultInfo?: ToolResultInfo;
  subagentMessages?: LogMessage[];
  SubagentConversation?: React.ComponentType<{ messages: LogMessage[]; cwd?: string }>;
  cwd?: string;
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
        cwd,
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

// ─── Task tool grouping ─────────────────────────────────────────────────

interface TaskGroup {
  type: "create" | "update" | "snapshot";
  startIdx: number;
  /** tool_use_id of the last block in this group (for timeline snapshot lookup) */
  lastToolUseId: string | null;
  /** Inline items extracted from the blocks (used as fallback when no timeline) */
  inlineItems: Array<{ content: string; status: string; taskId?: string }>;
}

/**
 * Pre-process blocks to find consecutive runs of task tool_use blocks.
 * Groups consecutive TaskCreate, TaskUpdate, and TodoWrite into aggregated units.
 * Returns a map: startIdx → TaskGroup for the leader of each run,
 * and a set of indices that are part of a group (to skip during normal render).
 */
export function groupTaskBlocks(blocks: ParsedContent[]): {
  groups: Map<number, TaskGroup>;
  grouped: Set<number>;
} {
  const groups = new Map<number, TaskGroup>();
  const grouped = new Set<number>();

  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type !== "tool_use" || !TASK_TOOL_NAMES.has(block.name ?? "")) {
      i++;
      continue;
    }

    // Start of a task tool run — collect consecutive task tool_use blocks
    const runStart = i;
    const runBlocks: ParsedContent[] = [];
    while (
      i < blocks.length &&
      blocks[i].type === "tool_use" &&
      TASK_TOOL_NAMES.has(blocks[i].name ?? "")
    ) {
      runBlocks.push(blocks[i]);
      grouped.add(i);
      i++;
    }

    // Categorize the run and collect inline items as fallback
    const inlineItems: TaskGroup["inlineItems"] = [];
    let createCount = 0;
    let updateCount = 0;
    let hasTodo = false;
    let lastToolUseId: string | null = null;

    for (const b of runBlocks) {
      if (b.id) lastToolUseId = b.id;
      const input = (b.input as Record<string, unknown>) ?? {};
      if (b.name === "TaskCreate") {
        createCount++;
        inlineItems.push({
          content: (input.subject as string) ?? "",
          status: "pending",
        });
      } else if (b.name === "TaskUpdate") {
        updateCount++;
        inlineItems.push({
          taskId: (input.taskId as string) ?? "",
          content: (input.subject as string) ?? "",
          status: (input.status as string) ?? "",
        });
      } else if (b.name === "TodoWrite") {
        hasTodo = true;
        const todos = input.todos as Array<{ content?: string; status?: string }> | undefined;
        if (Array.isArray(todos)) {
          // Replace inline items with the full snapshot from last TodoWrite
          inlineItems.length = 0;
          todos.forEach((t) => {
            inlineItems.push({ content: t.content ?? "", status: t.status ?? "pending" });
          });
        }
      }
    }

    const type = hasTodo ? "snapshot" : createCount >= updateCount && createCount > 0 ? "create" : updateCount > 0 ? "update" : null;
    if (type) {
      groups.set(runStart, { type, startIdx: runStart, lastToolUseId, inlineItems });
    }
  }

  return { groups, grouped };
}

export function statusIcon(status: string) {
  switch (status) {
    case "completed": return "✓";
    case "in_progress": return "▶";
    case "deleted": return "✕";
    default: return "○";
  }
}

export function statusClass(status: string) {
  switch (status) {
    case "completed": return "text-green-600";
    case "in_progress": return "text-blue-600";
    case "deleted": return "text-red-600";
    default: return "text-muted-foreground";
  }
}

function TaskToolGroup({
  group,
  taskTimeline,
}: {
  group: TaskGroup;
  taskTimeline?: Map<string, TaskTimelineItem[]>;
}) {
  // Use timeline snapshot for full board state; fall back to inline items
  const snapshot = group.lastToolUseId ? taskTimeline?.get(group.lastToolUseId) : undefined;
  const items: Array<{ content: string; status: string; taskId?: string }> =
    snapshot ?? group.inlineItems;

  const completed = items.filter((t) => t.status === "completed").length;
  const inProgress = items.filter((t) => t.status === "in_progress").length;
  const pending = items.filter(
    (t) => t.status !== "completed" && t.status !== "in_progress" && t.status !== "deleted"
  ).length;

  let label: string;
  if (group.type === "create") {
    label = `Created ${items.length} tasks`;
  } else {
    const parts: string[] = [];
    if (completed > 0) parts.push(`${completed} completed`);
    if (inProgress > 0) parts.push(`${inProgress} in progress`);
    if (pending > 0) parts.push(`${pending} pending`);
    label = `Tasks (${items.length}) — ${parts.join(", ")}`;
  }

  return (
    <div className="my-2 rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-2">
      <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
        <ListTodo className="h-3.5 w-3.5" />
        <span className="font-medium">{label}</span>
      </div>
      <ul className="mt-1.5 space-y-0.5">
        {items.map((item, j) => (
          <li
            key={j}
            className={`flex items-center gap-2 text-xs ${statusClass(item.status)}`}
          >
            <span className="w-4 text-center shrink-0">{statusIcon(item.status)}</span>
            {item.taskId && (
              <span className="font-mono text-muted-foreground">#{item.taskId}</span>
            )}
            <span>{item.content}</span>
          </li>
        ))}
      </ul>
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
  taskTimeline,
  cwd,
}: {
  blocks: ParsedContent[];
  toolResults: Map<string, ToolResultInfo>;
  taskToSubagent?: Map<string, string>;
  subagentMap?: Map<string, LogMessage[]>;
  SubagentConversation?: React.ComponentType<{ messages: LogMessage[]; cwd?: string }>;
  taskTimeline?: Map<string, TaskTimelineItem[]>;
  cwd?: string;
}) {
  const { groups, grouped } = groupTaskBlocks(blocks);

  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === "thinking" && block.thinking) {
          return <ThinkingBlock key={i} text={block.thinking} />;
        }
        if (block.type === "tool_use") {
          // Grouped task tools: render group leader, skip members
          if (grouped.has(i)) {
            const group = groups.get(i);
            if (group) {
              return <TaskToolGroup key={i} group={group} taskTimeline={taskTimeline} />;
            }
            return null; // member of a group — skip
          }

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
              cwd={cwd}
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
