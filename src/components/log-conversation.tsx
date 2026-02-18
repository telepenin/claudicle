"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MessageSquare,
  Bot,
  Wrench,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Brain,
  FileText,
  Terminal,
  Search,
  Globe,
  ListTodo,
  FolderSearch,
  Pencil,
  BookOpen,
  Code,
} from "lucide-react";
import type { LogConversation, LogMessage } from "@/lib/types";
import { formatDuration, formatDurationMinutes } from "@/lib/format";

// ─── Types ────────────────────────────────────────────────────────────────

interface ParsedContent {
  type?: string;
  text?: string;
  thinking?: string;
  content?: ParsedContent[] | string;
  tool_use_id?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  role?: string;
  model?: string;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  message?: string | ParsedContent;
  tool_name?: string;
  is_error?: boolean;
  output?: string;
}

interface ToolResultInfo {
  content: string;
  isError: boolean;
  timestamp?: string;
}

type Turn =
  | {
      kind: "user_prompt";
      message: LogMessage;
      content: ParsedContent[];
    }
  | {
      kind: "assistant_turn";
      messages: LogMessage[];
      contentBlocks: ParsedContent[];
      toolResults: Map<string, ToolResultInfo>;
      model?: string;
      usage?: ParsedContent["usage"];
      timestamp: string;
    }
  | {
      kind: "compact_summary";
      message: LogMessage;
      text: string;
    }
  | {
      kind: "turn_separator";
      durationMs: number;
      timestamp: string;
    }
  | {
      kind: "noise";
      message: LogMessage;
    };

// ─── Helpers ──────────────────────────────────────────────────────────────

function shortenModel(model: string): string {
  if (/opus/i.test(model)) return "opus";
  if (/sonnet/i.test(model)) return "sonnet";
  if (/haiku/i.test(model)) return "haiku";
  return model;
}

function normalizeMarkdown(text: string): string {
  return text.replace(/\*\*`([^`]+)`\*\*/g, "`$1`");
}

function countLines(text: string): number {
  return text.split("\n").length;
}

// ─── Parsing ──────────────────────────────────────────────────────────────

function parseMessage(raw: string): {
  msgType: string;
  content: ParsedContent[];
  model?: string;
  usage?: ParsedContent["usage"];
  isToolResult: boolean;
  isCompactSummary: boolean;
  messageId?: string;
  progressData?: { type: string; output?: string };
} {
  try {
    const parsed = JSON.parse(raw);
    const msgType: string = parsed.type ?? "unknown";

    // Progress messages
    if (msgType === "progress") {
      const d = parsed.data ?? {};
      return {
        msgType,
        content: [],
        isToolResult: false,
        isCompactSummary: false,
        progressData: {
          type: d.type ?? "progress",
          output: d.output ?? d.fullOutput,
        },
      };
    }

    // System / queue-operation / file-history-snapshot
    if (
      msgType === "system" ||
      msgType === "queue-operation" ||
      msgType === "file-history-snapshot"
    ) {
      return { msgType, content: [], isToolResult: false, isCompactSummary: false };
    }

    // Compact summary
    const isCompactSummary = parsed.isCompactSummary === true;

    if (parsed.message) {
      const msg =
        typeof parsed.message === "string"
          ? { type: "text", text: parsed.message }
          : parsed.message;

      const messageId: string | undefined = msg.id;

      if (Array.isArray(msg.content)) {
        const isToolResult =
          msgType === "user" &&
          msg.content.every(
            (b: ParsedContent) => b.type === "tool_result"
          );

        return {
          msgType,
          content: msg.content,
          model: msg.model ?? parsed.model,
          usage: msg.usage ?? parsed.usage,
          isToolResult,
          isCompactSummary,
          messageId,
        };
      }

      if (typeof msg.content === "string") {
        return {
          msgType,
          content: [{ type: "text", text: msg.content }],
          model: msg.model,
          isToolResult: false,
          isCompactSummary,
          messageId,
        };
      }

      if (msg.text || msg.type === "text") {
        return {
          msgType,
          content: [msg],
          isToolResult: false,
          isCompactSummary,
          messageId,
        };
      }

      return {
        msgType,
        content: [{ type: "text", text: JSON.stringify(msg) }],
        isToolResult: false,
        isCompactSummary,
        messageId,
      };
    }

    if (parsed.summary) {
      return {
        msgType,
        content: [{ type: "text", text: parsed.summary }],
        isToolResult: false,
        isCompactSummary,
      };
    }

    return { msgType, content: [], isToolResult: false, isCompactSummary };
  } catch {
    return {
      msgType: "unknown",
      content: [{ type: "text", text: raw }],
      isToolResult: false,
      isCompactSummary: false,
    };
  }
}

function extractToolResultText(block: ParsedContent): string {
  const content = block.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : c.text ?? ""))
      .join("\n");
  }
  if (block.output) return block.output;
  return "";
}

// ─── Turn grouping ───────────────────────────────────────────────────────

function groupIntoTurns(
  messages: LogMessage[],
  includeNoise: boolean = false
): Turn[] {
  const turns: Turn[] = [];
  const noiseTypes = new Set([
    "progress",
    "queue-operation",
    "file-history-snapshot",
  ]);

  type AssistantTurn = Extract<Turn, { kind: "assistant_turn" }>;
  let currentAssistant: AssistantTurn | null = null;
  const seenMessageIds = new Set<string>();

  function flushAssistant() {
    if (currentAssistant) {
      turns.push(currentAssistant);
      currentAssistant = null;
      seenMessageIds.clear();
    }
  }

  for (const msg of messages) {
    // Noise types — never affect turn grouping
    if (noiseTypes.has(msg.msg_type)) {
      if (includeNoise) {
        turns.push({ kind: "noise", message: msg });
      }
      continue;
    }

    // System messages
    if (msg.msg_type === "system") {
      try {
        const parsed = JSON.parse(msg.raw);
        if (parsed.subtype === "turn_duration") {
          flushAssistant();
          turns.push({
            kind: "turn_separator",
            durationMs: parsed.durationMs ?? 0,
            timestamp: msg.msg_timestamp,
          });
          continue;
        }
      } catch {
        // ignore parse errors
      }
      // Other system messages are noise
      if (includeNoise) {
        turns.push({ kind: "noise", message: msg });
      }
      continue;
    }

    // User messages
    if (msg.msg_type === "user") {
      const { content, isToolResult, isCompactSummary } = parseMessage(
        msg.raw
      );

      // Compact summary
      if (isCompactSummary) {
        flushAssistant();
        const text =
          content
            .filter((b) => b.type === "text" || !b.type)
            .map((b) => b.text ?? "")
            .join("\n") || "";
        turns.push({ kind: "compact_summary", message: msg, text });
        continue;
      }

      // Tool result delivery — belongs to current assistant turn
      if (isToolResult) {
        if (currentAssistant) {
          for (const block of content) {
            if (block.type === "tool_result" && block.tool_use_id) {
              currentAssistant.toolResults.set(block.tool_use_id, {
                content: extractToolResultText(block),
                isError: block.is_error === true,
                timestamp: msg.msg_timestamp,
              });
            }
          }
        }
        continue;
      }

      // Real user prompt — starts a new turn
      flushAssistant();
      turns.push({ kind: "user_prompt", message: msg, content });
      continue;
    }

    // Assistant messages
    if (msg.msg_type === "assistant") {
      const { content, model, usage, messageId } = parseMessage(msg.raw);

      if (!currentAssistant) {
        currentAssistant = {
          kind: "assistant_turn",
          messages: [msg],
          contentBlocks: [...content],
          toolResults: new Map(),
          model: model,
          usage: usage
            ? {
                input_tokens: usage.input_tokens ?? 0,
                output_tokens: usage.output_tokens ?? 0,
                cache_read_input_tokens:
                  usage.cache_read_input_tokens ?? 0,
                cache_creation_input_tokens:
                  usage.cache_creation_input_tokens ?? 0,
              }
            : undefined,
          timestamp: msg.msg_timestamp,
        };
        if (messageId) seenMessageIds.add(messageId);
      } else {
        currentAssistant.messages.push(msg);
        currentAssistant.contentBlocks.push(...content);

        if (!currentAssistant.model && model) {
          currentAssistant.model = model;
        }

        // Aggregate output tokens from distinct API responses
        if (usage?.output_tokens && messageId && !seenMessageIds.has(messageId)) {
          seenMessageIds.add(messageId);
          if (currentAssistant.usage) {
            currentAssistant.usage = {
              ...currentAssistant.usage,
              output_tokens:
                (currentAssistant.usage.output_tokens ?? 0) +
                (usage.output_tokens ?? 0),
            };
          } else {
            currentAssistant.usage = {
              input_tokens: usage.input_tokens ?? 0,
              output_tokens: usage.output_tokens ?? 0,
              cache_read_input_tokens:
                usage.cache_read_input_tokens ?? 0,
              cache_creation_input_tokens:
                usage.cache_creation_input_tokens ?? 0,
            };
          }
        }
      }
      continue;
    }
  }

  flushAssistant();
  return turns;
}

// ─── Subagent helpers ─────────────────────────────────────────────────────

function splitMainAndSubagent(messages: LogMessage[]): {
  mainMessages: LogMessage[];
  subagentMap: Map<string, LogMessage[]>;
} {
  const mainMessages: LogMessage[] = [];
  const subagentMap = new Map<string, LogMessage[]>();

  for (const msg of messages) {
    if (msg.is_sidechain && msg.agent_id) {
      let arr = subagentMap.get(msg.agent_id);
      if (!arr) {
        arr = [];
        subagentMap.set(msg.agent_id, arr);
      }
      arr.push(msg);
    } else {
      mainMessages.push(msg);
    }
  }

  return { mainMessages, subagentMap };
}

function getFirstUserPromptText(messages: LogMessage[]): string {
  for (const msg of messages) {
    if (msg.msg_type !== "user") continue;
    try {
      const parsed = JSON.parse(msg.raw);
      const m = parsed.message;
      if (!m) continue;
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.content)) {
        const textBlock = m.content.find(
          (b: ParsedContent) => b.type === "text" && b.text
        );
        if (textBlock?.text) return textBlock.text;
      }
      if (typeof m === "string") return m;
    } catch {
      // skip
    }
  }
  return "";
}

function buildTaskToSubagentMap(
  mainMessages: LogMessage[],
  subagentMap: Map<string, LogMessage[]>
): Map<string, string> {
  // Map<tool_use_id, agentId>
  const result = new Map<string, string>();

  // Collect all Task tool_use blocks with their prompt text and id
  const taskBlocks: { toolUseId: string; prompt: string }[] = [];
  for (const msg of mainMessages) {
    if (msg.msg_type !== "assistant") continue;
    const { content } = parseMessage(msg.raw);
    for (const block of content) {
      if (block.type === "tool_use" && block.name === "Task" && block.id) {
        const input = (block.input as Record<string, unknown>) ?? {};
        const prompt = (input.prompt as string) ?? "";
        if (prompt) {
          taskBlocks.push({ toolUseId: block.id, prompt });
        }
      }
    }
  }

  // Match each subagent's first user prompt to a Task block's prompt
  for (const [agentId, msgs] of subagentMap) {
    const firstPrompt = getFirstUserPromptText(msgs);
    if (!firstPrompt) continue;

    for (const task of taskBlocks) {
      if (result.has(task.toolUseId)) continue; // already matched
      if (task.prompt === firstPrompt) {
        result.set(task.toolUseId, agentId);
        break;
      }
    }
  }

  return result;
}

// ─── Markdown component ──────────────────────────────────────────────────

function Markdown({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-pre:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => (
            <pre className="overflow-auto rounded-md bg-muted p-3 text-xs text-foreground">
              {children}
            </pre>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code className={`${className} before:content-none after:content-none`}>
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono before:content-none after:content-none">
                {children}
              </code>
            );
          },
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-800"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">{children}</table>
            </div>
          ),
        }}
      >
        {normalizeMarkdown(text)}
      </ReactMarkdown>
    </div>
  );
}

// ─── CollapsibleContent ──────────────────────────────────────────────────

function CollapsibleContent({
  text,
  maxLines = 20,
  defaultOpen = false,
}: {
  text: string;
  maxLines?: number;
  defaultOpen?: boolean;
}) {
  const lines = text.split("\n");
  const totalLines = lines.length;
  const needsCollapse = totalLines > maxLines;
  const [expanded, setExpanded] = useState(defaultOpen || !needsCollapse);

  if (!needsCollapse) {
    return (
      <pre className="overflow-auto rounded-md bg-background p-3 text-xs whitespace-pre-wrap">
        {text}
      </pre>
    );
  }

  return (
    <div>
      <pre className="overflow-auto rounded-md bg-background p-3 text-xs whitespace-pre-wrap">
        {expanded ? text : lines.slice(0, maxLines).join("\n") + "\n…"}
      </pre>
      <button
        className="mt-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded
          ? "Show less"
          : `Show all ${totalLines} lines`}
      </button>
    </div>
  );
}

// ─── Specialized tool call renderers ─────────────────────────────────────

function ToolBadge({
  label,
  icon: Icon,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold font-mono uppercase tracking-wide">
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function WriteToolCall({ input }: { input: Record<string, unknown> }) {
  const filePath = (input.file_path as string) ?? "";
  const content = (input.content as string) ?? "";
  const lines = countLines(content);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <ToolBadge label="Write" icon={FileText} />
        <span className="font-mono text-xs text-muted-foreground">{filePath}</span>
        <span className="text-xs text-muted-foreground">{lines} lines</span>
      </div>
      {content && (
        <CollapsibleContent text={content} maxLines={15} />
      )}
    </div>
  );
}

type DiffLine = { type: "keep" | "del" | "add"; text: string };

function diffLines(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const m = oldLines.length;
  const n = newLines.length;

  // LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: "keep", text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "add", text: newLines[j - 1] });
      j--;
    } else {
      result.push({ type: "del", text: oldLines[i - 1] });
      i--;
    }
  }
  return result.reverse();
}

function EditToolCall({ input }: { input: Record<string, unknown> }) {
  const filePath = (input.file_path as string) ?? "";
  const oldStr = (input.old_string as string) ?? "";
  const newStr = (input.new_string as string) ?? "";
  const replaceAll = input.replace_all === true;

  const diff = useMemo(() => {
    if (!oldStr && !newStr) return [];
    if (!oldStr) return newStr.split("\n").map((t) => ({ type: "add" as const, text: t }));
    if (!newStr) return oldStr.split("\n").map((t) => ({ type: "del" as const, text: t }));
    return diffLines(oldStr, newStr);
  }, [oldStr, newStr]);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <ToolBadge label="Edit" icon={Pencil} />
        <span className="font-mono text-xs text-muted-foreground">{filePath}</span>
        {replaceAll && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
            replace all
          </Badge>
        )}
      </div>
      {diff.length > 0 && (
        <div className="overflow-auto rounded-md bg-background p-2 text-xs font-mono">
          {diff.map((line, i) => {
            if (line.type === "del") {
              return (
                <div key={i} className="bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 px-1">
                  <span className="select-none mr-1 opacity-60">-</span>
                  {line.text}
                </div>
              );
            }
            if (line.type === "add") {
              return (
                <div key={i} className="bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 px-1">
                  <span className="select-none mr-1 opacity-60">+</span>
                  {line.text}
                </div>
              );
            }
            return (
              <div key={i} className="text-muted-foreground px-1">
                <span className="select-none mr-1 opacity-40">&nbsp;</span>
                {line.text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function parseLineNumbered(text: string): { lineNo: number; code: string }[] {
  return text.split("\n").map((raw) => {
    const m = raw.match(/^\s*(\d+)→(.*)$/);
    if (m) return { lineNo: Number(m[1]), code: m[2] };
    return { lineNo: 0, code: raw };
  });
}

function CodeViewer({
  lines,
  maxLines = 30,
}: {
  lines: { lineNo: number; code: string }[];
  maxLines?: number;
}) {
  const needsCollapse = lines.length > maxLines;
  const [expanded, setExpanded] = useState(!needsCollapse);
  const visible = expanded ? lines : lines.slice(0, maxLines);
  const gutterWidth = String(lines[lines.length - 1]?.lineNo ?? lines.length).length;

  return (
    <div>
      <div className="overflow-auto bg-background text-xs font-mono">
        <table className="w-full border-collapse">
          <tbody>
            {visible.map((line, i) => (
              <tr key={i} className="hover:bg-muted/50">
                <td className="select-none text-right pr-3 pl-3 text-muted-foreground/50 border-r border-border/50 align-top" style={{ width: `${gutterWidth + 2}ch` }}>
                  {line.lineNo || ""}
                </td>
                <td className="pl-3 pr-3 whitespace-pre-wrap break-all">
                  {line.code}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {needsCollapse && (
        <button
          className="mt-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  );
}

function ReadToolCall({
  input,
  resultContent,
}: {
  input: Record<string, unknown>;
  resultContent?: string;
}) {
  const filePath = (input.file_path as string) ?? "";
  const offset = input.offset as number | undefined;
  const limit = input.limit as number | undefined;
  const [showContent, setShowContent] = useState(false);

  const parsed = useMemo(
    () => (resultContent ? parseLineNumbered(resultContent) : []),
    [resultContent]
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <ToolBadge label="Read" icon={BookOpen} />
        <span className="font-mono text-xs text-muted-foreground">{filePath}</span>
        {(offset || limit) && (
          <span className="text-xs text-muted-foreground">
            {offset ? `from line ${offset}` : ""}
            {limit ? ` (${limit} lines)` : ""}
          </span>
        )}
      </div>
      {parsed.length > 0 && (
        <div>
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowContent(!showContent)}
          >
            {showContent ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>{parsed.length} lines</span>
          </button>
          {showContent && <CodeViewer lines={parsed} />}
        </div>
      )}
    </div>
  );
}

function BashToolCall({ input }: { input: Record<string, unknown> }) {
  const command = (input.command as string) ?? "";
  const description = (input.description as string) ?? "";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <ToolBadge label="Bash" icon={Terminal} />
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
      {command && (
        <pre className="overflow-auto rounded-md bg-gray-900 text-gray-100 p-3 text-xs font-mono">
          <span className="text-gray-500">$ </span>
          {command}
        </pre>
      )}
    </div>
  );
}

function GlobToolCall({ input }: { input: Record<string, unknown> }) {
  const pattern = (input.pattern as string) ?? "";
  const path = (input.path as string) ?? "";
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <ToolBadge label="Glob" icon={FolderSearch} />
      <span className="font-mono text-xs text-muted-foreground">{pattern}</span>
      {path && (
        <span className="text-xs text-muted-foreground">in {path}</span>
      )}
    </div>
  );
}

type GrepResultLine =
  | { kind: "match"; file: string; lineNo: number; code: string; isMatch: boolean }
  | { kind: "file"; path: string }
  | { kind: "text"; text: string };

function parseGrepResult(text: string): GrepResultLine[] {
  return text.split("\n").filter(Boolean).map((raw) => {
    // Single-file match: 123:code (no filename)
    const singleMatch = raw.match(/^(\d+):(.*)$/);
    if (singleMatch) return { kind: "match" as const, file: "", lineNo: Number(singleMatch[1]), code: singleMatch[2], isMatch: true };
    // Single-file context: 123-code (no filename)
    const singleCtx = raw.match(/^(\d+)-(.*)$/);
    if (singleCtx) return { kind: "match" as const, file: "", lineNo: Number(singleCtx[1]), code: singleCtx[2], isMatch: false };
    // Multi-file match: /path/to/file:123:code
    const multiMatch = raw.match(/^(.+?):(\d+):(.*)$/);
    if (multiMatch) return { kind: "match" as const, file: multiMatch[1], lineNo: Number(multiMatch[2]), code: multiMatch[3], isMatch: true };
    // Multi-file context: /path/to/file-123-code
    const multiCtx = raw.match(/^(.+?)-(\d+)-(.*)$/);
    if (multiCtx) return { kind: "match" as const, file: multiCtx[1], lineNo: Number(multiCtx[2]), code: multiCtx[3], isMatch: false };
    // files_with_matches mode: lines starting with /
    if (raw.startsWith("/")) return { kind: "file" as const, path: raw };
    // anything else (summary lines, "No matches found", group separators, etc.)
    return { kind: "text" as const, text: raw };
  });
}

function GrepContentView({ lines }: { lines: Extract<GrepResultLine, { kind: "match" }>[] }) {
  // Group by file
  const groups: { file: string; matches: { lineNo: number; code: string; isMatch: boolean }[] }[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && last.file === line.file) {
      last.matches.push({ lineNo: line.lineNo, code: line.code, isMatch: line.isMatch });
    } else {
      groups.push({ file: line.file, matches: [{ lineNo: line.lineNo, code: line.code, isMatch: line.isMatch }] });
    }
  }

  return (
    <div className="overflow-auto bg-background text-xs font-mono">
      {groups.map((group, gi) => (
        <div key={gi}>
          {group.file && (
            <div className={`px-3 py-1 text-muted-foreground truncate ${gi > 0 ? "border-t border-border/50" : ""}`}>
              {group.file}
            </div>
          )}
          <table className="w-full border-collapse">
            <tbody>
              {group.matches.map((match, mi) => (
                <tr key={mi} className={match.isMatch ? "bg-yellow-50 dark:bg-yellow-950/20" : "hover:bg-muted/50"}>
                  <td className="select-none text-right pr-3 pl-3 text-muted-foreground/50 border-r border-border/50 align-top" style={{ width: "5ch" }}>
                    {match.lineNo}
                  </td>
                  <td className="pl-3 pr-3 whitespace-pre-wrap break-all">
                    {match.code}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function GrepToolCall({
  input,
  resultContent,
}: {
  input: Record<string, unknown>;
  resultContent?: string;
}) {
  const pattern = (input.pattern as string) ?? "";
  const path = (input.path as string) ?? "";
  const [showContent, setShowContent] = useState(false);

  const parsed = useMemo(
    () => (resultContent ? parseGrepResult(resultContent) : []),
    [resultContent]
  );

  const matches = parsed.filter((p): p is Extract<GrepResultLine, { kind: "match" }> => p.kind === "match");
  const files = parsed.filter((p): p is Extract<GrepResultLine, { kind: "file" }> => p.kind === "file");
  const texts = parsed.filter((p): p is Extract<GrepResultLine, { kind: "text" }> => p.kind === "text");

  const resultLines = resultContent ? resultContent.split("\n").filter(Boolean).length : 0;

  // Determine display mode
  const hasMatches = matches.length > 0;
  const hasFiles = files.length > 0;
  const hasText = texts.length > 0;

  let toggleLabel = `${resultLines} lines`;
  if (hasMatches && !hasFiles && !hasText) {
    toggleLabel = `${matches.length} matches`;
  } else if (hasFiles && !hasMatches) {
    toggleLabel = `${files.length} files`;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <ToolBadge label="Grep" icon={Search} />
        <span className="font-mono text-xs text-muted-foreground">{pattern}</span>
        {path && (
          <span className="text-xs text-muted-foreground">in {path}</span>
        )}
      </div>
      {resultLines > 0 && (
        <div>
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowContent(!showContent)}
          >
            {showContent ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>{toggleLabel}</span>
          </button>
          {showContent && hasMatches && (
            <GrepContentView lines={matches} />
          )}
          {showContent && hasFiles && !hasMatches && (
            <div className="overflow-auto bg-background text-xs font-mono p-3 space-y-0.5">
              {files.map((p, i) => (
                <div key={i} className="text-muted-foreground">{p.path}</div>
              ))}
            </div>
          )}
          {showContent && !hasMatches && !hasFiles && hasText && (
            <div className="overflow-auto bg-background text-xs font-mono p-3 space-y-0.5">
              {texts.map((p, i) => (
                <div key={i} className="text-muted-foreground">{p.text}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CollapsibleMarkdown({
  text,
  maxLines = 10,
  defaultOpen = false,
}: {
  text: string;
  maxLines?: number;
  defaultOpen?: boolean;
}) {
  const totalLines = text.split("\n").length;
  const needsCollapse = totalLines > maxLines;
  const [expanded, setExpanded] = useState(defaultOpen || !needsCollapse);

  return (
    <div>
      {expanded ? (
        <Markdown text={text} />
      ) : (
        <Markdown text={text.split("\n").slice(0, maxLines).join("\n") + "\n…"} />
      )}
      {needsCollapse && (
        <button
          className="mt-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : `Show all (${totalLines} lines)`}
        </button>
      )}
    </div>
  );
}

function TaskToolCall({
  input,
  resultContent,
  subagentMessages,
}: {
  input: Record<string, unknown>;
  resultContent?: string;
  subagentMessages?: LogMessage[];
}) {
  const subagentType = (input.subagent_type as string) ?? "";
  const description = (input.description as string) ?? "";
  const prompt = (input.prompt as string) ?? "";
  const [showResult, setShowResult] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <ToolBadge label="Task" icon={Code} />
        {subagentType && (
          <Badge variant="outline" className="text-xs font-mono">
            {subagentType}
          </Badge>
        )}
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
      {prompt && (
        <CollapsibleMarkdown text={prompt} maxLines={8} />
      )}
      {subagentMessages && subagentMessages.length > 0 && (
        <SubagentConversation messages={subagentMessages} />
      )}
      {resultContent && (
        <div>
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowResult(!showResult)}
          >
            {showResult ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>Result</span>
          </button>
          {showResult && (
            <div className="mt-1 rounded-md bg-white dark:bg-background p-3">
              <CollapsibleMarkdown text={resultContent} maxLines={20} defaultOpen={true} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubagentConversation({ messages }: { messages: LogMessage[] }) {
  const [expanded, setExpanded] = useState(false);

  const turns = useMemo(() => groupIntoTurns(messages), [messages]);

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
                return <AssistantTurnCard key={i} turn={turn} />;
              case "compact_summary":
                return <CompactSummaryBanner key={i} turn={turn} />;
              case "turn_separator":
                return <TurnSeparator key={i} turn={turn} />;
            }
          })}
        </div>
      )}
    </div>
  );
}

function parseSearchContent(text: string): { links: { title: string; url: string }[]; markdown: string } {
  const links: { title: string; url: string }[] = [];
  let markdown = "";

  // Extract Links: [{...}] JSON
  const linksMatch = text.match(/Links:\s*(\[[\s\S]*?\])\s*\n/);
  if (linksMatch) {
    try {
      const parsed = JSON.parse(linksMatch[1]);
      if (Array.isArray(parsed)) {
        for (const l of parsed) {
          if (l.title && l.url) links.push({ title: l.title, url: l.url });
        }
      }
    } catch {
      // ignore
    }
    // Everything after the links JSON block is markdown content
    const afterLinks = text.slice(linksMatch.index! + linksMatch[0].length).trim();
    // Strip trailing REMINDER lines
    markdown = afterLinks.replace(/\n*REMINDER:.*$/s, "").trim();
  }

  return { links, markdown };
}

function WebSearchToolCall({
  input,
  resultContent,
}: {
  input: Record<string, unknown>;
  resultContent?: string;
}) {
  const query = (input.query as string) ?? "";
  const [showContent, setShowContent] = useState(false);

  const { links, markdown } = useMemo(
    () => (resultContent ? parseSearchContent(resultContent) : { links: [], markdown: "" }),
    [resultContent]
  );

  const hasContent = links.length > 0 || markdown;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <ToolBadge label="Search" icon={Search} />
        <span className="text-xs text-foreground">{query}</span>
      </div>
      {hasContent && (
        <div>
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowContent(!showContent)}
          >
            {showContent ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>{links.length} results</span>
          </button>
          {showContent && (
            <div className="mt-1 space-y-2">
              {links.length > 0 && (
                <ul className="space-y-0.5 text-xs">
                  {links.map((link, i) => (
                    <li key={i}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline hover:text-blue-800"
                      >
                        {link.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {markdown && (
                <CollapsibleMarkdown text={markdown} maxLines={15} defaultOpen={true} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WebFetchToolCall({
  input,
  resultContent,
}: {
  input: Record<string, unknown>;
  resultContent?: string;
}) {
  const url = (input.url as string) ?? "";
  const [showContent, setShowContent] = useState(false);
  const lineCount = resultContent ? resultContent.split("\n").length : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <ToolBadge label="Fetch" icon={Globe} />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 underline hover:text-blue-800 font-mono truncate max-w-md"
        >
          {url}
        </a>
      </div>
      {resultContent && (
        <div>
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowContent(!showContent)}
          >
            {showContent ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>{lineCount} lines</span>
          </button>
          {showContent && (
            <CollapsibleMarkdown text={resultContent} maxLines={30} defaultOpen={true} />
          )}
        </div>
      )}
    </div>
  );
}

function TodoWriteToolCall({ input }: { input: Record<string, unknown> }) {
  const todos = input.todos as Array<{
    id?: string;
    content?: string;
    status?: string;
  }> | undefined;
  if (!todos || !Array.isArray(todos)) {
    return (
      <div className="flex items-center gap-2">
        <ToolBadge label="Todo" icon={ListTodo} />
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <ToolBadge label="Todo" icon={ListTodo} />
      <ul className="mt-1 space-y-0.5 text-xs">
        {todos.map((t, i) => {
          const icon =
            t.status === "completed"
              ? "✓"
              : t.status === "in_progress"
                ? "▶"
                : "○";
          const cls =
            t.status === "completed"
              ? "text-green-600"
              : t.status === "in_progress"
                ? "text-blue-600"
                : "text-muted-foreground";
          return (
            <li key={t.id ?? i} className={`flex items-center gap-1.5 ${cls}`}>
              <span>{icon}</span>
              <span>{t.content ?? `Task ${t.id ?? i}`}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GenericToolCall({
  name,
  input,
}: {
  name: string;
  input: Record<string, unknown>;
}) {
  const entries = Object.entries(input).filter(
    ([, v]) => v !== undefined && v !== null
  );
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <ToolBadge label={name} icon={Wrench} />
      </div>
      {entries.length > 0 && (
        <div className="text-xs space-y-0.5 pl-1">
          {entries.map(([key, value]) => {
            const display =
              typeof value === "string"
                ? value.length > 200
                  ? value.slice(0, 200) + "…"
                  : value
                : JSON.stringify(value);
            return (
              <div key={key} className="flex gap-2">
                <span className="text-muted-foreground font-mono shrink-0">
                  {key}:
                </span>
                <span className="font-mono break-all">{display}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Dispatch tool renderer ──────────────────────────────────────────────

function renderToolCallContent(
  name: string,
  input: Record<string, unknown>,
  resultContent?: string,
  subagentMessages?: LogMessage[]
) {
  switch (name) {
    case "Write":
      return <WriteToolCall input={input} />;
    case "Edit":
      return <EditToolCall input={input} />;
    case "Read":
      return <ReadToolCall input={input} resultContent={resultContent} />;
    case "Bash":
      return <BashToolCall input={input} />;
    case "Glob":
      return <GlobToolCall input={input} />;
    case "Grep":
      return <GrepToolCall input={input} resultContent={resultContent} />;
    case "Task":
      return <TaskToolCall input={input} resultContent={resultContent} subagentMessages={subagentMessages} />;
    case "WebSearch":
      return <WebSearchToolCall input={input} resultContent={resultContent} />;
    case "WebFetch":
      return <WebFetchToolCall input={input} resultContent={resultContent} />;
    case "TodoWrite":
      return <TodoWriteToolCall input={input} />;
    default:
      return <GenericToolCall name={name} input={input} />;
  }
}

// ─── Content block components ────────────────────────────────────────────

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

const TOOL_COLORS: Record<string, { border: string; bg: string }> = {
  Write: { border: "border-violet-400", bg: "bg-violet-50 dark:bg-violet-950/20" },
  Edit: { border: "border-violet-400", bg: "bg-violet-50 dark:bg-violet-950/20" },
  Read: { border: "border-sky-400", bg: "bg-sky-50 dark:bg-sky-950/20" },
  Bash: { border: "border-orange-400", bg: "bg-orange-50 dark:bg-orange-950/20" },
  Glob: { border: "border-teal-400", bg: "bg-teal-50 dark:bg-teal-950/20" },
  Grep: { border: "border-teal-400", bg: "bg-teal-50 dark:bg-teal-950/20" },
  Task: { border: "border-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-950/20" },
  WebSearch: { border: "border-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
  WebFetch: { border: "border-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
  TodoWrite: { border: "border-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950/20" },
};
const DEFAULT_TOOL_COLOR = { border: "border-gray-400", bg: "bg-gray-50 dark:bg-gray-950/20" };

// Tools that render their own result content (skip generic result toggle)
const SELF_RENDERING_TOOLS = new Set(["Read", "Grep", "WebFetch", "WebSearch", "Task"]);

function ToolUseBlock({
  block,
  resultInfo,
  subagentMessages,
}: {
  block: ParsedContent;
  resultInfo?: ToolResultInfo;
  subagentMessages?: LogMessage[];
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
        name === "Task" ? subagentMessages : undefined
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

function ContentBlocks({
  blocks,
  toolResults,
  taskToSubagent,
  subagentMap,
}: {
  blocks: ParsedContent[];
  toolResults: Map<string, ToolResultInfo>;
  taskToSubagent?: Map<string, string>;
  subagentMap?: Map<string, LogMessage[]>;
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

// ─── Usage display ────────────────────────────────────────────────────────

function UsageInfo({ usage }: { usage: ParsedContent["usage"] }) {
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

// ─── Turn card components ─────────────────────────────────────────────────

function UserPromptCard({
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

function AssistantTurnCard({
  turn,
  taskToSubagent,
  subagentMap,
}: {
  turn: Extract<Turn, { kind: "assistant_turn" }>;
  taskToSubagent?: Map<string, string>;
  subagentMap?: Map<string, LogMessage[]>;
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

function CompactSummaryBanner({
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

function TurnSeparator({
  turn,
}: {
  turn: Extract<Turn, { kind: "turn_separator" }>;
}) {
  const seconds = Math.round(turn.durationMs / 1000);
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">{seconds}s</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}


// ─── Conversation summary ─────────────────────────────────────────────────

function ConversationSummary({ messages }: { messages: LogMessage[] }) {
  const stats = useMemo(() => {
    const turns = groupIntoTurns(messages);
    let userPrompts = 0;
    let assistantTurns = 0;
    let toolCalls = 0;
    let model = "";

    for (const turn of turns) {
      if (turn.kind === "user_prompt") userPrompts++;
      if (turn.kind === "assistant_turn") {
        assistantTurns++;
        if (!model && turn.model) model = turn.model;
        toolCalls += turn.contentBlocks.filter(
          (b) => b.type === "tool_use"
        ).length;
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

    return { userPrompts, assistantTurns, toolCalls, model, durationMin };
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
      {stats.durationMin > 0 && <span>{formatDurationMinutes(stats.durationMin)} duration</span>}
    </div>
  );
}

// ─── Raw JSONL view ───────────────────────────────────────────────────────

function RawJsonlView({ messages }: { messages: LogMessage[] }) {
  return (
    <div className="divide-y divide-border">
      {messages.map((msg, i) => {
        let formatted = msg.raw;
        try {
          formatted = JSON.stringify(JSON.parse(msg.raw), null, 2);
        } catch {
          // keep raw
        }
        return (
          <div key={`${msg.msg_timestamp}-${i}`} className="py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5">
              <span className="font-mono">{msg.msg_type}</span>
              <span>
                {new Date(msg.msg_timestamp).toLocaleTimeString()}
              </span>
            </div>
            <pre className="overflow-auto rounded-md bg-background p-3 text-xs whitespace-pre-wrap">
              {formatted}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

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
                  />
                );
              case "compact_summary":
                return <CompactSummaryBanner key={i} turn={turn} />;
              case "turn_separator":
                return <TurnSeparator key={i} turn={turn} />;
            }
          })}
        </div>
      )}
    </div>
  );
}
