import type { LogMessage } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────

export interface ParsedContent {
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

export interface ToolResultInfo {
  content: string;
  isError: boolean;
  timestamp?: string;
}

export type Turn =
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
      kind: "skill_loaded";
      message: LogMessage;
      skillName: string;
      text: string;
    }
  | {
      kind: "noise";
      message: LogMessage;
    };

// ─── Helpers ──────────────────────────────────────────────────────────────

export function shortenModel(model: string): string {
  if (/opus/i.test(model)) return "opus";
  if (/sonnet/i.test(model)) return "sonnet";
  if (/haiku/i.test(model)) return "haiku";
  return model;
}

export function countLines(text: string): number {
  return text.split("\n").length;
}

export function toRelativePath(fullPath: string, cwd: string): string {
  if (!cwd || !fullPath.startsWith(cwd)) return fullPath;
  const rel = fullPath.slice(cwd.length);
  return rel.startsWith("/") ? rel.slice(1) : rel;
}

export function extractCwd(messages: LogMessage[]): string {
  for (const msg of messages) {
    try {
      const parsed = JSON.parse(msg.raw);
      if (parsed.cwd) return parsed.cwd;
    } catch {
      // skip
    }
  }
  return "";
}

// ─── Parsing ──────────────────────────────────────────────────────────────

export function parseMessage(raw: string): {
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

export function extractToolResultText(block: ParsedContent): string {
  const content = block.content;
  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .map((c) => (typeof c === "string" ? c : c.text ?? ""))
      .join("\n");
  } else if (block.output) {
    text = block.output;
  }
  // Strip <tool_use_error>...</tool_use_error> wrapper if present
  return text.replace(/<\/?tool_use_error>/g, "").trim();
}

// ─── Message reordering ──────────────────────────────────────────────────

/**
 * Fix timestamp ordering for Skill tool messages.
 * The Skill tool injects a user text message (skill content) that arrives
 * ~1ms BEFORE the tool_result closing the Skill tool_use. This causes
 * groupIntoTurns to flush the assistant turn before the tool_result is attached.
 * Fix: swap adjacent user messages where a tool_result follows a non-tool-result
 * user message within a small time window.
 */
export function reorderMessages(messages: LogMessage[]): LogMessage[] {
  const result = [...messages];
  for (let i = 1; i < result.length; i++) {
    if (result[i].msg_type !== "user" || result[i - 1].msg_type !== "user") continue;

    const currParsed = parseMessage(result[i].raw);
    if (!currParsed.isToolResult) continue;

    const prevParsed = parseMessage(result[i - 1].raw);
    if (prevParsed.isToolResult || prevParsed.isCompactSummary) continue;

    // Current is tool_result, prev is non-tool-result user message
    const timeDiff = Math.abs(
      new Date(result[i].msg_timestamp).getTime() -
      new Date(result[i - 1].msg_timestamp).getTime()
    );
    if (timeDiff < 100) {
      [result[i], result[i - 1]] = [result[i - 1], result[i]];
    }
  }
  return result;
}

// ─── Turn grouping ───────────────────────────────────────────────────────

export function groupIntoTurns(
  messages: LogMessage[],
  includeNoise: boolean = false
): Turn[] {
  const reordered = reorderMessages(messages);
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

  for (const msg of reordered) {
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

      // Skill-injected user message — render as collapsed banner
      const firstText = content.find((b) => b.type === "text" || !b.type)?.text ?? "";
      if (firstText.startsWith("Base directory for this skill:")) {
        const skillMatch = firstText.match(/skills\/([^\n/]+)/);
        const skillName = skillMatch ? skillMatch[1] : "skill";
        flushAssistant();
        turns.push({ kind: "skill_loaded", message: msg, skillName, text: firstText });
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

// ─── Task timeline ────────────────────────────────────────────────────────

export interface TaskTimelineItem {
  taskId: string;
  content: string;
  status: string;
}

const TASK_MGMT_TOOLS = new Set([
  "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "TaskStop", "TodoWrite",
]);

/**
 * Build a timeline of task board snapshots across turns.
 * For each task-management tool_use block, saves the cumulative board state
 * (Map keyed by tool_use_id → full TaskTimelineItem[] at that point).
 *
 * This lets TaskUpdate groups show the FULL board — not just the changed items.
 */
export function buildTaskTimeline(turns: Turn[]): Map<string, TaskTimelineItem[]> {
  const state = new Map<string, TaskTimelineItem>();
  const snapshots = new Map<string, TaskTimelineItem[]>();

  for (const turn of turns) {
    if (turn.kind !== "assistant_turn") continue;

    for (const block of turn.contentBlocks) {
      if (block.type !== "tool_use" || !block.id) continue;
      if (!TASK_MGMT_TOOLS.has(block.name ?? "")) continue;

      const input = (block.input as Record<string, unknown>) ?? {};

      if (block.name === "TaskCreate") {
        const subject = (input.subject as string) ?? "";
        // Extract task ID from tool result text: "Task #N created successfully: ..."
        const result = turn.toolResults.get(block.id);
        const idMatch = result?.content?.match(/Task #(\d+)/);
        const taskId = idMatch?.[1] ?? `t${state.size + 1}`;
        state.set(taskId, { taskId, content: subject, status: "pending" });
      } else if (block.name === "TaskUpdate") {
        const taskId = (input.taskId as string) ?? "";
        const status = (input.status as string) ?? "";
        if (taskId && state.has(taskId)) {
          state.get(taskId)!.status = status;
          const newSubject = (input.subject as string);
          if (newSubject) state.get(taskId)!.content = newSubject;
        }
      } else if (block.name === "TodoWrite") {
        const todos = input.todos as Array<{ content?: string; status?: string }> | undefined;
        if (Array.isArray(todos)) {
          state.clear();
          todos.forEach((t, i) => {
            const taskId = String(i + 1);
            state.set(taskId, { taskId, content: t.content ?? "", status: t.status ?? "pending" });
          });
        }
      }
      // For all task tools (including TaskList/TaskGet/TaskStop), save snapshot
      // Deep copy items so later mutations don't affect previous snapshots
      snapshots.set(block.id, Array.from(state.values()).map(item => ({ ...item })));
    }
  }

  return snapshots;
}

// ─── Subagent helpers ─────────────────────────────────────────────────────

export function splitMainAndSubagent(messages: LogMessage[]): {
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

export function getFirstUserPromptText(messages: LogMessage[]): string {
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

export function buildTaskToSubagentMap(
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
