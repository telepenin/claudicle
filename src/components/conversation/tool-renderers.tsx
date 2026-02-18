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
  CirclePlus,
  RefreshCw,
  ArrowRight,
  MessageCircleQuestion,
  Check,
  Circle,
  Map as MapIcon,
  LogOut,
} from "lucide-react";
import { CollapsibleContent, CollapsibleMarkdown } from "./markdown";
import { countLines, toRelativePath } from "@/lib/turn-grouping";
import { diffLines, parseLineNumbered, parseGrepResult, parseSearchContent, parseAnswers } from "@/lib/parsers";
import type { GrepResultLine } from "@/lib/parsers";
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
  TodoWrite: { border: "border-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20" },
  TaskCreate: { border: "border-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20" },
  TaskUpdate: { border: "border-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20" },
  TaskList: { border: "border-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20" },
  TaskGet: { border: "border-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20" },
  AskUserQuestion: { border: "border-blue-400", bg: "bg-blue-50 dark:bg-blue-950/20" },
  EnterPlanMode: { border: "border-purple-400", bg: "bg-purple-50 dark:bg-purple-950/20" },
  ExitPlanMode: { border: "border-purple-400", bg: "bg-purple-50 dark:bg-purple-950/20" },
};
export const DEFAULT_TOOL_COLOR = { border: "border-gray-400", bg: "bg-gray-50 dark:bg-gray-950/20" };

// Tools that render their own result content (skip generic result toggle)
export const SELF_RENDERING_TOOLS = new Set(["Read", "Grep", "WebFetch", "WebSearch", "Task", "AskUserQuestion", "ExitPlanMode"]);

// ─── Write ───────────────────────────────────────────────────────────────

function WriteToolCall({ input, cwd }: { input: Record<string, unknown>; cwd?: string }) {
  const filePath = (input.file_path as string) ?? "";
  const content = (input.content as string) ?? "";
  const lines = countLines(content);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <ToolBadge label="Write" icon={FileText} />
        <span className="font-mono text-xs text-muted-foreground">{toRelativePath(filePath, cwd ?? "")}</span>
        <span className="text-xs text-muted-foreground">{lines} lines</span>
      </div>
      {content && (
        <CollapsibleContent text={content} maxLines={15} />
      )}
    </div>
  );
}

// ─── Edit (with diff) ────────────────────────────────────────────────────

function EditToolCall({ input, cwd }: { input: Record<string, unknown>; cwd?: string }) {
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
        <span className="font-mono text-xs text-muted-foreground">{toRelativePath(filePath, cwd ?? "")}</span>
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
      <div className="overflow-auto rounded-md bg-background text-xs font-mono">
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
  cwd,
}: {
  input: Record<string, unknown>;
  resultContent?: string;
  cwd?: string;
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
        <span className="font-mono text-xs text-muted-foreground">{toRelativePath(filePath, cwd ?? "")}</span>
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

function GlobToolCall({ input, cwd }: { input: Record<string, unknown>; cwd?: string }) {
  const pattern = (input.pattern as string) ?? "";
  const path = (input.path as string) ?? "";
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <ToolBadge label="Glob" icon={FolderSearch} />
      <span className="font-mono text-xs text-muted-foreground">{pattern}</span>
      {path && (
        <span className="text-xs text-muted-foreground">in {toRelativePath(path, cwd ?? "")}</span>
      )}
    </div>
  );
}

// ─── Grep ────────────────────────────────────────────────────────────────

function GrepContentView({ lines, cwd }: { lines: Extract<GrepResultLine, { kind: "match" }>[]; cwd?: string }) {
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
    <div className="overflow-auto rounded-md bg-background text-xs font-mono">
      {groups.map((group, gi) => (
        <div key={gi}>
          {group.file && (
            <div className={`px-3 py-1 text-muted-foreground truncate ${gi > 0 ? "border-t border-border/50" : ""}`}>
              {toRelativePath(group.file, cwd ?? "")}
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
  cwd,
}: {
  input: Record<string, unknown>;
  resultContent?: string;
  cwd?: string;
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
          <span className="text-xs text-muted-foreground">in {toRelativePath(path, cwd ?? "")}</span>
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
            <GrepContentView lines={matches} cwd={cwd} />
          )}
          {showContent && hasFiles && !hasMatches && (
            <div className="overflow-auto rounded-md bg-background text-xs font-mono p-3 space-y-0.5">
              {files.map((p, i) => (
                <div key={i} className="text-muted-foreground">{toRelativePath(p.path, cwd ?? "")}</div>
              ))}
            </div>
          )}
          {showContent && !hasMatches && !hasFiles && hasText && (
            <div className="overflow-auto rounded-md bg-background text-xs font-mono p-3 space-y-0.5">
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

// ─── TaskCreate ───────────────────────────────────────────────────────

function TaskCreateToolCall({ input }: { input: Record<string, unknown> }) {
  const subject = (input.subject as string) ?? "";
  const description = (input.description as string) ?? "";
  const activeForm = (input.activeForm as string) ?? "";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <ToolBadge label="TaskCreate" icon={CirclePlus} />
      </div>
      <div className="text-sm font-medium">{subject}</div>
      {description && (
        <div className="text-xs text-muted-foreground line-clamp-2">{description}</div>
      )}
      {activeForm && (
        <div className="text-xs text-muted-foreground italic">{activeForm}</div>
      )}
    </div>
  );
}

// ─── TaskUpdate ───────────────────────────────────────────────────────

function TaskUpdateToolCall({ input }: { input: Record<string, unknown> }) {
  const taskId = (input.taskId as string) ?? "";
  const status = (input.status as string) ?? "";
  const subject = (input.subject as string) ?? "";
  const icon =
    status === "completed"
      ? "✓"
      : status === "in_progress"
        ? "▶"
        : status === "deleted"
          ? "✕"
          : "○";
  const cls =
    status === "completed"
      ? "text-green-600"
      : status === "in_progress"
        ? "text-blue-600"
        : status === "deleted"
          ? "text-red-600"
          : "text-muted-foreground";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <ToolBadge label="TaskUpdate" icon={RefreshCw} />
        <span className="text-xs text-muted-foreground">#{taskId}</span>
        {status && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${cls}`}>
            <ArrowRight className="h-3 w-3" />
            <span>{icon} {status}</span>
          </span>
        )}
      </div>
      {subject && (
        <div className="text-xs text-muted-foreground">{subject}</div>
      )}
    </div>
  );
}

// ─── TodoWrite ────────────────────────────────────────────────────────

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

// ─── AskUserQuestion ──────────────────────────────────────────────────

interface AskQuestion {
  question?: string;
  header?: string;
  options?: Array<{ label?: string; description?: string }>;
  multiSelect?: boolean;
}

function AskUserQuestionToolCall({
  input,
  resultContent,
}: {
  input: Record<string, unknown>;
  resultContent?: string;
}) {
  const questions = (input.questions as AskQuestion[]) ?? [];
  const answers = useMemo(
    () => (resultContent ? parseAnswers(resultContent) : new Map<string, { answer: string; notes?: string }>()),
    [resultContent],
  );

  return (
    <div className="space-y-2">
      <ToolBadge label="Question" icon={MessageCircleQuestion} />
      {questions.map((q, qi) => {
        const answerInfo = q.question ? answers.get(q.question) : undefined;
        return (
          <div key={qi} className="space-y-1">
            <div className="flex items-center gap-2">
              {q.header && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                  {q.header}
                </Badge>
              )}
              <span className="text-sm">{q.question}</span>
            </div>
            {q.options && q.options.length > 0 && (
              <div className="space-y-0.5 ml-1">
                {q.options.map((opt, oi) => {
                  const selected = answerInfo?.answer === opt.label;
                  return (
                    <div
                      key={oi}
                      className={`flex items-start gap-2 text-xs rounded px-1.5 py-0.5 ${
                        selected
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"
                          : "text-muted-foreground"
                      }`}
                    >
                      {selected ? (
                        <Check className="h-3 w-3 mt-0.5 shrink-0" />
                      ) : (
                        <Circle className="h-3 w-3 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <span className={selected ? "font-medium" : ""}>{opt.label}</span>
                        {opt.description && (
                          <span className="ml-1 opacity-70">— {opt.description}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {answerInfo && !q.options?.some((o) => o.label === answerInfo.answer) && (
              <div className="flex items-start gap-2 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded px-1.5 py-0.5 ml-1">
                <Check className="h-3 w-3 mt-0.5 shrink-0" />
                <span className="font-medium">{answerInfo.answer}</span>
              </div>
            )}
            {answerInfo?.notes && (
              <div className="text-xs text-muted-foreground ml-6 italic">
                Note: {answerInfo.notes}
              </div>
            )}
          </div>
        );
      })}
      {!resultContent && (
        <span className="text-xs text-muted-foreground italic">Waiting for answer…</span>
      )}
    </div>
  );
}

// ─── EnterPlanMode / ExitPlanMode ─────────────────────────────────────

function EnterPlanModeToolCall() {
  return (
    <div className="flex items-center gap-2">
      <ToolBadge label="Plan" icon={MapIcon} />
      <span className="text-xs text-muted-foreground">Entering plan mode…</span>
    </div>
  );
}

function ExitPlanModeToolCall({
  input,
  resultContent,
}: {
  input: Record<string, unknown>;
  resultContent?: string;
}) {
  const plan = (input.plan as string) ?? "";
  const rejected = resultContent?.includes("rejected") ?? false;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <ToolBadge label="Plan" icon={LogOut} />
        <span className="text-xs text-muted-foreground">Exiting plan mode</span>
        {resultContent && (
          <Badge
            variant={rejected ? "destructive" : "outline"}
            className="text-[10px] px-1.5 py-0 h-4"
          >
            {rejected ? "rejected" : "approved"}
          </Badge>
        )}
      </div>
      {plan && (
        <CollapsibleMarkdown text={plan} maxLines={15} />
      )}
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
  cwd,
}: {
  input: Record<string, unknown>;
  resultContent?: string;
  subagentMessages?: LogMessage[];
  SubagentConversation?: React.ComponentType<{ messages: LogMessage[]; cwd?: string }>;
  cwd?: string;
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
        <SubagentConversation messages={subagentMessages} cwd={cwd} />
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
  cwd?: string,
) {
  switch (name) {
    case "Write":
      return <WriteToolCall input={input} cwd={cwd} />;
    case "Edit":
      return <EditToolCall input={input} cwd={cwd} />;
    case "Read":
      return <ReadToolCall input={input} resultContent={resultContent} cwd={cwd} />;
    case "Bash":
      return <BashToolCall input={input} />;
    case "Glob":
      return <GlobToolCall input={input} cwd={cwd} />;
    case "Grep":
      return <GrepToolCall input={input} resultContent={resultContent} cwd={cwd} />;
    case "Task":
      return <TaskToolCall input={input} resultContent={resultContent} subagentMessages={subagentMessages} SubagentConversation={SubagentConversation} cwd={cwd} />;
    case "WebSearch":
      return <WebSearchToolCall input={input} resultContent={resultContent} />;
    case "WebFetch":
      return <WebFetchToolCall input={input} resultContent={resultContent} />;
    case "TaskCreate":
      return <TaskCreateToolCall input={input} />;
    case "TaskUpdate":
      return <TaskUpdateToolCall input={input} />;
    case "TodoWrite":
      return <TodoWriteToolCall input={input} />;
    case "AskUserQuestion":
      return <AskUserQuestionToolCall input={input} resultContent={resultContent} />;
    case "EnterPlanMode":
      return <EnterPlanModeToolCall />;
    case "ExitPlanMode":
      return <ExitPlanModeToolCall input={input} resultContent={resultContent} />;
    default:
      return <GenericToolCall name={name} input={input} />;
  }
}
