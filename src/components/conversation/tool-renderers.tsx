"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Terminal,
  Search,
  Globe,
  ListTodo,
  FolderSearch,
  Pencil,
  BookOpen,
  Code,
  Wrench,
} from "lucide-react";
import { CollapsibleContent, CollapsibleMarkdown } from "./markdown";
import { countLines } from "@/lib/turn-grouping";
import type { LogMessage } from "@/lib/types";

// ─── ToolBadge ───────────────────────────────────────────────────────────

export function ToolBadge({
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

// ─── Tool colors ─────────────────────────────────────────────────────────

export const TOOL_COLORS: Record<string, { border: string; bg: string }> = {
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
export const DEFAULT_TOOL_COLOR = { border: "border-gray-400", bg: "bg-gray-50 dark:bg-gray-950/20" };

// Tools that render their own result content (skip generic result toggle)
export const SELF_RENDERING_TOOLS = new Set(["Read", "Grep", "WebFetch", "WebSearch", "Task"]);

// ─── Write ───────────────────────────────────────────────────────────────

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

// ─── Edit (with diff) ────────────────────────────────────────────────────

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

// ─── Read ────────────────────────────────────────────────────────────────

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

// ─── Bash ────────────────────────────────────────────────────────────────

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

// ─── Glob ────────────────────────────────────────────────────────────────

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

// ─── Grep ────────────────────────────────────────────────────────────────

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

// ─── WebSearch ───────────────────────────────────────────────────────────

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

// ─── WebFetch ────────────────────────────────────────────────────────────

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

// ─── TodoWrite ───────────────────────────────────────────────────────────

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

// ─── Generic ─────────────────────────────────────────────────────────────

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

// ─── Task ────────────────────────────────────────────────────────────────

export function TaskToolCall({
  input,
  resultContent,
  subagentMessages,
  SubagentConversation,
}: {
  input: Record<string, unknown>;
  resultContent?: string;
  subagentMessages?: LogMessage[];
  SubagentConversation?: React.ComponentType<{ messages: LogMessage[] }>;
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
      {subagentMessages && subagentMessages.length > 0 && SubagentConversation && (
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

// ─── Dispatch tool renderer ──────────────────────────────────────────────

export function renderToolCallContent(
  name: string,
  input: Record<string, unknown>,
  resultContent?: string,
  subagentMessages?: LogMessage[],
  SubagentConversation?: React.ComponentType<{ messages: LogMessage[] }>,
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
      return <TaskToolCall input={input} resultContent={resultContent} subagentMessages={subagentMessages} SubagentConversation={SubagentConversation} />;
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
