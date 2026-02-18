import { describe, it, expect } from "vitest";
import type { LogMessage } from "./types";
import {
  shortenModel,
  countLines,
  toRelativePath,
  extractCwd,
  parseMessage,
  extractToolResultText,
  reorderMessages,
  groupIntoTurns,
  buildTaskTimeline,
  splitMainAndSubagent,
  getFirstUserPromptText,
  buildTaskToSubagentMap,
} from "./turn-grouping";

function makeMsg(
  overrides: Partial<LogMessage> & { raw: string }
): LogMessage {
  return {
    session_id: "test",
    msg_type: "user",
    msg_timestamp: "2025-01-01T00:00:00Z",
    raw: overrides.raw,
    file: "",
    is_sidechain: false,
    agent_id: "",
    ...overrides,
  };
}

// ─── shortenModel ─────────────────────────────────────────────────────────

describe("shortenModel", () => {
  it("recognises opus", () => {
    expect(shortenModel("claude-opus-4-20250514")).toBe("opus");
  });

  it("recognises sonnet", () => {
    expect(shortenModel("claude-sonnet-4-20250514")).toBe("sonnet");
  });

  it("recognises haiku", () => {
    expect(shortenModel("claude-haiku-3-5-20241022")).toBe("haiku");
  });

  it("passes through unknown models", () => {
    expect(shortenModel("gpt-4")).toBe("gpt-4");
  });
});

// ─── countLines ───────────────────────────────────────────────────────────

describe("countLines", () => {
  it("counts empty string as 1 line", () => {
    expect(countLines("")).toBe(1);
  });

  it("counts single line", () => {
    expect(countLines("hello")).toBe(1);
  });

  it("counts multiple lines", () => {
    expect(countLines("a\nb\nc")).toBe(3);
  });
});

// ─── toRelativePath ───────────────────────────────────────────────────────

describe("toRelativePath", () => {
  it("strips matching cwd prefix", () => {
    expect(toRelativePath("/home/user/project/src/foo.ts", "/home/user/project")).toBe(
      "src/foo.ts"
    );
  });

  it("returns full path when cwd does not match", () => {
    expect(toRelativePath("/other/path/file.ts", "/home/user/project")).toBe(
      "/other/path/file.ts"
    );
  });

  it("returns full path when cwd is empty", () => {
    expect(toRelativePath("/some/file.ts", "")).toBe("/some/file.ts");
  });

  it("returns empty string when fullPath equals cwd exactly", () => {
    // cwd.length slice yields "", which doesn't start with "/"
    expect(toRelativePath("/home/user", "/home/user")).toBe("");
  });
});

// ─── extractCwd ───────────────────────────────────────────────────────────

describe("extractCwd", () => {
  it("finds cwd from first matching message", () => {
    const msgs = [
      makeMsg({ raw: JSON.stringify({ cwd: "/home/user/project" }) }),
      makeMsg({ raw: JSON.stringify({ cwd: "/other" }) }),
    ];
    expect(extractCwd(msgs)).toBe("/home/user/project");
  });

  it("returns empty string when not found", () => {
    const msgs = [makeMsg({ raw: JSON.stringify({ type: "user" }) })];
    expect(extractCwd(msgs)).toBe("");
  });

  it("skips invalid JSON gracefully", () => {
    const msgs = [
      makeMsg({ raw: "not json" }),
      makeMsg({ raw: JSON.stringify({ cwd: "/found" }) }),
    ];
    expect(extractCwd(msgs)).toBe("/found");
  });
});

// ─── parseMessage ─────────────────────────────────────────────────────────

describe("parseMessage", () => {
  it("parses user text message", () => {
    const raw = JSON.stringify({
      type: "user",
      message: { role: "user", content: "Hello" },
    });
    const result = parseMessage(raw);
    expect(result.msgType).toBe("user");
    expect(result.content).toEqual([{ type: "text", text: "Hello" }]);
    expect(result.isToolResult).toBe(false);
  });

  it("parses tool_result user message", () => {
    const raw = JSON.stringify({
      type: "user",
      message: {
        content: [
          { type: "tool_result", tool_use_id: "tu1", content: "ok" },
        ],
      },
    });
    const result = parseMessage(raw);
    expect(result.isToolResult).toBe(true);
    expect(result.content[0].type).toBe("tool_result");
  });

  it("parses assistant message with usage", () => {
    const raw = JSON.stringify({
      type: "assistant",
      message: {
        id: "msg_1",
        model: "claude-opus-4-20250514",
        content: [{ type: "text", text: "Hi" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    });
    const result = parseMessage(raw);
    expect(result.msgType).toBe("assistant");
    expect(result.model).toBe("claude-opus-4-20250514");
    expect(result.usage?.input_tokens).toBe(100);
    expect(result.messageId).toBe("msg_1");
  });

  it("parses system messages", () => {
    const raw = JSON.stringify({ type: "system" });
    const result = parseMessage(raw);
    expect(result.msgType).toBe("system");
    expect(result.content).toEqual([]);
  });

  it("parses progress messages", () => {
    const raw = JSON.stringify({
      type: "progress",
      data: { type: "progress", output: "building..." },
    });
    const result = parseMessage(raw);
    expect(result.msgType).toBe("progress");
    expect(result.progressData?.output).toBe("building...");
  });

  it("parses compact summary", () => {
    const raw = JSON.stringify({
      type: "user",
      isCompactSummary: true,
      message: { content: "Summary text" },
    });
    const result = parseMessage(raw);
    expect(result.isCompactSummary).toBe(true);
  });

  it("handles invalid JSON as fallback", () => {
    const result = parseMessage("not json at all");
    expect(result.msgType).toBe("unknown");
    expect(result.content[0].text).toBe("not json at all");
  });

  it("parses message with string message field", () => {
    const raw = JSON.stringify({
      type: "user",
      message: "plain string message",
    });
    const result = parseMessage(raw);
    expect(result.content[0]).toEqual({ type: "text", text: "plain string message" });
  });

  it("parses message with text field on message object", () => {
    const raw = JSON.stringify({
      type: "assistant",
      message: { text: "some text", type: "text" },
    });
    const result = parseMessage(raw);
    expect(result.content[0].text).toBe("some text");
  });

  it("falls back to JSON.stringify for unknown message shape", () => {
    const raw = JSON.stringify({
      type: "user",
      message: { foo: "bar" },
    });
    const result = parseMessage(raw);
    expect(result.content[0].text).toBe('{"foo":"bar"}');
  });

  it("parses summary field", () => {
    const raw = JSON.stringify({ type: "user", summary: "This is a summary" });
    const result = parseMessage(raw);
    expect(result.content[0]).toEqual({ type: "text", text: "This is a summary" });
  });

  it("returns empty content when no message/summary", () => {
    const raw = JSON.stringify({ type: "unknown" });
    const result = parseMessage(raw);
    expect(result.msgType).toBe("unknown");
    expect(result.content).toEqual([]);
  });

  it("parses progress with fullOutput fallback", () => {
    const raw = JSON.stringify({
      type: "progress",
      data: { fullOutput: "full output text" },
    });
    const result = parseMessage(raw);
    expect(result.progressData?.output).toBe("full output text");
  });

  it("parses progress with no data", () => {
    const raw = JSON.stringify({ type: "progress" });
    const result = parseMessage(raw);
    expect(result.progressData?.type).toBe("progress");
  });

  it("parses file-history-snapshot type", () => {
    const raw = JSON.stringify({ type: "file-history-snapshot" });
    const result = parseMessage(raw);
    expect(result.msgType).toBe("file-history-snapshot");
    expect(result.content).toEqual([]);
  });
});

// ─── extractToolResultText ────────────────────────────────────────────────

describe("extractToolResultText", () => {
  it("extracts string content", () => {
    expect(extractToolResultText({ content: "hello" })).toBe("hello");
  });

  it("extracts array content", () => {
    const block = {
      content: [
        { type: "text" as const, text: "line1" },
        { type: "text" as const, text: "line2" },
      ],
    };
    expect(extractToolResultText(block)).toBe("line1\nline2");
  });

  it("falls back to output field", () => {
    expect(extractToolResultText({ output: "output text" })).toBe(
      "output text"
    );
  });

  it("returns empty string when nothing found", () => {
    expect(extractToolResultText({})).toBe("");
  });

  it("handles array with raw string elements", () => {
    // content array can contain raw strings (not objects)
    const block = { content: ["hello" as unknown as import("./turn-grouping").ParsedContent, "world" as unknown as import("./turn-grouping").ParsedContent] };
    expect(extractToolResultText(block)).toBe("hello\nworld");
  });
});

// ─── reorderMessages ──────────────────────────────────────────────────────

describe("reorderMessages", () => {
  it("swaps user messages within 100ms when tool_result follows non-tool-result", () => {
    const textMsg = makeMsg({
      msg_type: "user",
      msg_timestamp: "2025-01-01T00:00:00.000Z",
      raw: JSON.stringify({
        type: "user",
        message: { content: "skill content" },
      }),
    });
    const toolResultMsg = makeMsg({
      msg_type: "user",
      msg_timestamp: "2025-01-01T00:00:00.001Z",
      raw: JSON.stringify({
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "tu1", content: "ok" },
          ],
        },
      }),
    });
    const result = reorderMessages([textMsg, toolResultMsg]);
    // tool_result should now be first
    expect(parseMessage(result[0].raw).isToolResult).toBe(true);
    expect(parseMessage(result[1].raw).isToolResult).toBe(false);
  });

  it("does NOT swap when time difference > 100ms", () => {
    const textMsg = makeMsg({
      msg_type: "user",
      msg_timestamp: "2025-01-01T00:00:00.000Z",
      raw: JSON.stringify({
        type: "user",
        message: { content: "text" },
      }),
    });
    const toolResultMsg = makeMsg({
      msg_type: "user",
      msg_timestamp: "2025-01-01T00:00:01.000Z",
      raw: JSON.stringify({
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "tu1", content: "ok" },
          ],
        },
      }),
    });
    const result = reorderMessages([textMsg, toolResultMsg]);
    // No swap — original order preserved
    expect(parseMessage(result[0].raw).isToolResult).toBe(false);
  });

  it("leaves non-user messages untouched", () => {
    const msgs = [
      makeMsg({ msg_type: "assistant", raw: JSON.stringify({ type: "assistant", message: { content: "hi" } }) }),
      makeMsg({ msg_type: "system", raw: JSON.stringify({ type: "system" }) }),
    ];
    const result = reorderMessages(msgs);
    expect(result[0].msg_type).toBe("assistant");
    expect(result[1].msg_type).toBe("system");
  });
});

// ─── groupIntoTurns ───────────────────────────────────────────────────────

describe("groupIntoTurns", () => {
  it("creates user_prompt → assistant_turn sequence", () => {
    const msgs = [
      makeMsg({
        msg_type: "user",
        raw: JSON.stringify({ type: "user", message: { content: "Hi" } }),
      }),
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({
          type: "assistant",
          message: { content: [{ type: "text", text: "Hello" }] },
        }),
      }),
    ];
    const turns = groupIntoTurns(msgs);
    expect(turns[0].kind).toBe("user_prompt");
    expect(turns[1].kind).toBe("assistant_turn");
  });

  it("attaches tool results to current assistant turn", () => {
    const msgs = [
      makeMsg({
        msg_type: "user",
        raw: JSON.stringify({ type: "user", message: { content: "Do something" } }),
      }),
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({
          type: "assistant",
          message: {
            content: [{ type: "tool_use", id: "tu1", name: "Bash", input: { command: "ls" } }],
          },
        }),
      }),
      makeMsg({
        msg_type: "user",
        msg_timestamp: "2025-01-01T00:00:01Z",
        raw: JSON.stringify({
          type: "user",
          message: {
            content: [{ type: "tool_result", tool_use_id: "tu1", content: "file.txt" }],
          },
        }),
      }),
    ];
    const turns = groupIntoTurns(msgs);
    const assistantTurn = turns.find((t) => t.kind === "assistant_turn");
    expect(assistantTurn).toBeDefined();
    if (assistantTurn?.kind === "assistant_turn") {
      expect(assistantTurn.toolResults.get("tu1")?.content).toBe("file.txt");
    }
  });

  it("creates turn_separator from system turn_duration", () => {
    const msgs = [
      makeMsg({
        msg_type: "system",
        raw: JSON.stringify({ type: "system", subtype: "turn_duration", durationMs: 5000 }),
      }),
    ];
    const turns = groupIntoTurns(msgs);
    expect(turns[0].kind).toBe("turn_separator");
    if (turns[0].kind === "turn_separator") {
      expect(turns[0].durationMs).toBe(5000);
    }
  });

  it("creates compact_summary turn", () => {
    const msgs = [
      makeMsg({
        msg_type: "user",
        raw: JSON.stringify({
          type: "user",
          isCompactSummary: true,
          message: { content: "This is a summary" },
        }),
      }),
    ];
    const turns = groupIntoTurns(msgs);
    expect(turns[0].kind).toBe("compact_summary");
  });

  it("creates skill_loaded turn for skill content", () => {
    const msgs = [
      makeMsg({
        msg_type: "user",
        raw: JSON.stringify({
          type: "user",
          message: {
            content: "Base directory for this skill: /path/to/skills/my-skill\nContent here",
          },
        }),
      }),
    ];
    const turns = groupIntoTurns(msgs);
    expect(turns[0].kind).toBe("skill_loaded");
    if (turns[0].kind === "skill_loaded") {
      expect(turns[0].skillName).toBe("my-skill");
    }
  });

  it("filters noise types by default", () => {
    const msgs = [
      makeMsg({ msg_type: "progress", raw: JSON.stringify({ type: "progress" }) }),
      makeMsg({ msg_type: "queue-operation", raw: JSON.stringify({ type: "queue-operation" }) }),
    ];
    const turns = groupIntoTurns(msgs);
    expect(turns).toHaveLength(0);
  });

  it("includes noise when requested", () => {
    const msgs = [
      makeMsg({ msg_type: "progress", raw: JSON.stringify({ type: "progress" }) }),
    ];
    const turns = groupIntoTurns(msgs, true);
    expect(turns).toHaveLength(1);
    expect(turns[0].kind).toBe("noise");
  });

  it("aggregates multiple assistant messages into one turn", () => {
    const msgs = [
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({
          type: "assistant",
          message: {
            id: "msg_1",
            content: [{ type: "text", text: "Part 1" }],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        }),
      }),
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({
          type: "assistant",
          message: {
            id: "msg_1",
            content: [{ type: "text", text: "Part 2" }],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        }),
      }),
    ];
    const turns = groupIntoTurns(msgs);
    expect(turns).toHaveLength(1);
    expect(turns[0].kind).toBe("assistant_turn");
    if (turns[0].kind === "assistant_turn") {
      expect(turns[0].contentBlocks).toHaveLength(2);
      // Same messageId → output tokens not double-counted
      expect(turns[0].usage?.output_tokens).toBe(50);
    }
  });

  it("sets model from second assistant msg when first had none", () => {
    const msgs = [
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({
          type: "assistant",
          message: { content: [{ type: "text", text: "A" }] },
        }),
      }),
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({
          type: "assistant",
          message: {
            id: "msg_2",
            model: "claude-sonnet-4-20250514",
            content: [{ type: "text", text: "B" }],
          },
        }),
      }),
    ];
    const turns = groupIntoTurns(msgs);
    if (turns[0].kind === "assistant_turn") {
      expect(turns[0].model).toBe("claude-sonnet-4-20250514");
    }
  });

  it("sets usage from second msg when first had no usage", () => {
    const msgs = [
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({
          type: "assistant",
          message: { content: [{ type: "text", text: "A" }] },
        }),
      }),
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({
          type: "assistant",
          message: {
            id: "msg_2",
            content: [{ type: "text", text: "B" }],
            usage: { input_tokens: 200, output_tokens: 80 },
          },
        }),
      }),
    ];
    const turns = groupIntoTurns(msgs);
    if (turns[0].kind === "assistant_turn") {
      expect(turns[0].usage).toBeDefined();
      expect(turns[0].usage?.output_tokens).toBe(80);
      expect(turns[0].usage?.input_tokens).toBe(200);
    }
  });

  it("treats non-turn_duration system messages as noise", () => {
    const msgs = [
      makeMsg({
        msg_type: "system",
        raw: JSON.stringify({ type: "system", subtype: "init" }),
      }),
    ];
    // Without includeNoise, they're filtered
    expect(groupIntoTurns(msgs)).toHaveLength(0);
    // With includeNoise, they appear as noise
    const turns = groupIntoTurns(msgs, true);
    expect(turns).toHaveLength(1);
    expect(turns[0].kind).toBe("noise");
  });

  it("handles system message with invalid JSON as noise", () => {
    const msgs = [
      makeMsg({ msg_type: "system", raw: "not json" }),
    ];
    const turns = groupIntoTurns(msgs, true);
    expect(turns).toHaveLength(1);
    expect(turns[0].kind).toBe("noise");
  });

  it("does not swap compact summary in reorderMessages", () => {
    const summaryMsg = makeMsg({
      msg_type: "user",
      msg_timestamp: "2025-01-01T00:00:00.000Z",
      raw: JSON.stringify({
        type: "user",
        isCompactSummary: true,
        message: { content: "Summary" },
      }),
    });
    const toolResultMsg = makeMsg({
      msg_type: "user",
      msg_timestamp: "2025-01-01T00:00:00.001Z",
      raw: JSON.stringify({
        type: "user",
        message: {
          content: [{ type: "tool_result", tool_use_id: "tu1", content: "ok" }],
        },
      }),
    });
    const result = reorderMessages([summaryMsg, toolResultMsg]);
    // compact summary should NOT be swapped
    expect(parseMessage(result[0].raw).isCompactSummary).toBe(true);
  });

  it("deduplicates token counts by messageId", () => {
    const msgs = [
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({
          type: "assistant",
          message: {
            id: "msg_1",
            content: [{ type: "text", text: "A" }],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        }),
      }),
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({
          type: "assistant",
          message: {
            id: "msg_2",
            content: [{ type: "text", text: "B" }],
            usage: { input_tokens: 100, output_tokens: 30 },
          },
        }),
      }),
    ];
    const turns = groupIntoTurns(msgs);
    if (turns[0].kind === "assistant_turn") {
      expect(turns[0].usage?.output_tokens).toBe(80); // 50 + 30
    }
  });
});

// ─── buildTaskTimeline ────────────────────────────────────────────────────

describe("buildTaskTimeline", () => {
  it("tracks TaskCreate as pending", () => {
    const turns = groupIntoTurns([
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "tu1",
                name: "TaskCreate",
                input: { subject: "Do thing" },
              },
            ],
          },
        }),
      }),
      makeMsg({
        msg_type: "user",
        msg_timestamp: "2025-01-01T00:00:01Z",
        raw: JSON.stringify({
          type: "user",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: "tu1",
                content: "Task #1 created successfully: Do thing",
              },
            ],
          },
        }),
      }),
    ]);
    const timeline = buildTaskTimeline(turns);
    const snapshot = timeline.get("tu1");
    expect(snapshot).toBeDefined();
    expect(snapshot![0].content).toBe("Do thing");
    expect(snapshot![0].status).toBe("pending");
  });

  it("tracks TaskUpdate status changes", () => {
    const turns = groupIntoTurns([
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", id: "tu1", name: "TaskCreate", input: { subject: "Task A" } },
              { type: "tool_use", id: "tu2", name: "TaskUpdate", input: { taskId: "1", status: "in_progress" } },
            ],
          },
        }),
      }),
      makeMsg({
        msg_type: "user",
        msg_timestamp: "2025-01-01T00:00:01Z",
        raw: JSON.stringify({
          type: "user",
          message: {
            content: [
              { type: "tool_result", tool_use_id: "tu1", content: "Task #1 created successfully: Task A" },
              { type: "tool_result", tool_use_id: "tu2", content: "Updated task #1" },
            ],
          },
        }),
      }),
    ]);
    const timeline = buildTaskTimeline(turns);
    const snapshot = timeline.get("tu2");
    expect(snapshot).toBeDefined();
    expect(snapshot![0].status).toBe("in_progress");
  });

  it("TodoWrite replaces all tasks", () => {
    const turns = groupIntoTurns([
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", id: "tu1", name: "TaskCreate", input: { subject: "Old" } },
              {
                type: "tool_use",
                id: "tu2",
                name: "TodoWrite",
                input: {
                  todos: [
                    { content: "New task 1", status: "pending" },
                    { content: "New task 2", status: "completed" },
                  ],
                },
              },
            ],
          },
        }),
      }),
      makeMsg({
        msg_type: "user",
        msg_timestamp: "2025-01-01T00:00:01Z",
        raw: JSON.stringify({
          type: "user",
          message: {
            content: [
              { type: "tool_result", tool_use_id: "tu1", content: "Task #1 created successfully: Old" },
              { type: "tool_result", tool_use_id: "tu2", content: "ok" },
            ],
          },
        }),
      }),
    ]);
    const timeline = buildTaskTimeline(turns);
    const snapshot = timeline.get("tu2");
    expect(snapshot).toHaveLength(2);
    expect(snapshot![0].content).toBe("New task 1");
    expect(snapshot![1].content).toBe("New task 2");
  });

  it("snapshots are deep-copied (independent of later mutations)", () => {
    const turns = groupIntoTurns([
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", id: "tu1", name: "TaskCreate", input: { subject: "A" } },
            ],
          },
        }),
      }),
      makeMsg({
        msg_type: "user",
        msg_timestamp: "2025-01-01T00:00:01Z",
        raw: JSON.stringify({
          type: "user",
          message: {
            content: [
              { type: "tool_result", tool_use_id: "tu1", content: "Task #1 created successfully: A" },
            ],
          },
        }),
      }),
      makeMsg({
        msg_type: "assistant",
        msg_timestamp: "2025-01-01T00:00:02Z",
        raw: JSON.stringify({
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", id: "tu2", name: "TaskUpdate", input: { taskId: "1", status: "completed" } },
            ],
          },
        }),
      }),
      makeMsg({
        msg_type: "user",
        msg_timestamp: "2025-01-01T00:00:03Z",
        raw: JSON.stringify({
          type: "user",
          message: {
            content: [
              { type: "tool_result", tool_use_id: "tu2", content: "ok" },
            ],
          },
        }),
      }),
    ]);
    const timeline = buildTaskTimeline(turns);
    const snap1 = timeline.get("tu1");
    const snap2 = timeline.get("tu2");
    // snap1 should still show pending, not affected by later update
    expect(snap1![0].status).toBe("pending");
    expect(snap2![0].status).toBe("completed");
  });
});

// ─── splitMainAndSubagent ─────────────────────────────────────────────────

describe("splitMainAndSubagent", () => {
  it("separates main from sidechain messages", () => {
    const msgs = [
      makeMsg({ raw: "main1" }),
      makeMsg({ raw: "sub1", is_sidechain: true, agent_id: "agent-1" }),
      makeMsg({ raw: "main2" }),
      makeMsg({ raw: "sub2", is_sidechain: true, agent_id: "agent-1" }),
      makeMsg({ raw: "sub3", is_sidechain: true, agent_id: "agent-2" }),
    ];
    const { mainMessages, subagentMap } = splitMainAndSubagent(msgs);
    expect(mainMessages).toHaveLength(2);
    expect(subagentMap.size).toBe(2);
    expect(subagentMap.get("agent-1")).toHaveLength(2);
    expect(subagentMap.get("agent-2")).toHaveLength(1);
  });

  it("returns all as main when no subagents", () => {
    const msgs = [makeMsg({ raw: "a" }), makeMsg({ raw: "b" })];
    const { mainMessages, subagentMap } = splitMainAndSubagent(msgs);
    expect(mainMessages).toHaveLength(2);
    expect(subagentMap.size).toBe(0);
  });
});

// ─── getFirstUserPromptText ──────────────────────────────────────────────

describe("getFirstUserPromptText", () => {
  it("extracts string content", () => {
    const msgs = [
      makeMsg({
        msg_type: "user",
        raw: JSON.stringify({ type: "user", message: { content: "Hello world" } }),
      }),
    ];
    expect(getFirstUserPromptText(msgs)).toBe("Hello world");
  });

  it("extracts text from array content", () => {
    const msgs = [
      makeMsg({
        msg_type: "user",
        raw: JSON.stringify({
          type: "user",
          message: {
            content: [{ type: "text", text: "Array text" }],
          },
        }),
      }),
    ];
    expect(getFirstUserPromptText(msgs)).toBe("Array text");
  });

  it("extracts from string message field", () => {
    const msgs = [
      makeMsg({
        msg_type: "user",
        raw: JSON.stringify({ type: "user", message: "direct string" }),
      }),
    ];
    expect(getFirstUserPromptText(msgs)).toBe("direct string");
  });

  it("skips user messages with no message field", () => {
    const msgs = [
      makeMsg({
        msg_type: "user",
        raw: JSON.stringify({ type: "user" }),
      }),
      makeMsg({
        msg_type: "user",
        raw: JSON.stringify({ type: "user", message: { content: "found it" } }),
      }),
    ];
    expect(getFirstUserPromptText(msgs)).toBe("found it");
  });

  it("returns empty string when no user messages", () => {
    const msgs = [
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({ type: "assistant", message: { content: "hi" } }),
      }),
    ];
    expect(getFirstUserPromptText(msgs)).toBe("");
  });
});

// ─── buildTaskToSubagentMap ──────────────────────────────────────────────

describe("buildTaskToSubagentMap", () => {
  it("matches subagent prompt to Task tool_use", () => {
    const mainMsgs = [
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "tu1",
                name: "Task",
                input: { prompt: "Do the thing" },
              },
            ],
          },
        }),
      }),
    ];
    const subagentMap = new Map([
      [
        "agent-1",
        [
          makeMsg({
            msg_type: "user",
            raw: JSON.stringify({
              type: "user",
              message: { content: "Do the thing" },
            }),
          }),
        ],
      ],
    ]);
    const result = buildTaskToSubagentMap(mainMsgs, subagentMap);
    expect(result.get("tu1")).toBe("agent-1");
  });

  it("returns empty map when no match", () => {
    const mainMsgs = [
      makeMsg({
        msg_type: "assistant",
        raw: JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "tu1",
                name: "Task",
                input: { prompt: "prompt A" },
              },
            ],
          },
        }),
      }),
    ];
    const subagentMap = new Map([
      [
        "agent-1",
        [
          makeMsg({
            msg_type: "user",
            raw: JSON.stringify({
              type: "user",
              message: { content: "different prompt" },
            }),
          }),
        ],
      ],
    ]);
    const result = buildTaskToSubagentMap(mainMsgs, subagentMap);
    expect(result.size).toBe(0);
  });
});
