import { describe, it, expect } from "vitest";
import { groupTaskBlocks, statusIcon, statusClass } from "./content-blocks";
import type { ParsedContent } from "@/lib/turn-grouping";

// ─── statusIcon ───────────────────────────────────────────────────────────

describe("statusIcon", () => {
  it("returns check for completed", () => {
    expect(statusIcon("completed")).toBe("✓");
  });

  it("returns play for in_progress", () => {
    expect(statusIcon("in_progress")).toBe("▶");
  });

  it("returns X for deleted", () => {
    expect(statusIcon("deleted")).toBe("✕");
  });

  it("returns circle for unknown status", () => {
    expect(statusIcon("pending")).toBe("○");
    expect(statusIcon("")).toBe("○");
  });
});

// ─── statusClass ──────────────────────────────────────────────────────────

describe("statusClass", () => {
  it("returns green for completed", () => {
    expect(statusClass("completed")).toBe("text-green-600");
  });

  it("returns blue for in_progress", () => {
    expect(statusClass("in_progress")).toBe("text-blue-600");
  });

  it("returns red for deleted", () => {
    expect(statusClass("deleted")).toBe("text-red-600");
  });

  it("returns muted for default", () => {
    expect(statusClass("pending")).toBe("text-muted-foreground");
    expect(statusClass("")).toBe("text-muted-foreground");
  });
});

// ─── groupTaskBlocks ──────────────────────────────────────────────────────

describe("groupTaskBlocks", () => {
  it("returns empty groups for no task blocks", () => {
    const blocks: ParsedContent[] = [
      { type: "text", text: "hello" },
      { type: "tool_use", id: "tu1", name: "Bash", input: { command: "ls" } },
    ];
    const { groups, grouped } = groupTaskBlocks(blocks);
    expect(groups.size).toBe(0);
    expect(grouped.size).toBe(0);
  });

  it("groups consecutive TaskCreate blocks", () => {
    const blocks: ParsedContent[] = [
      { type: "tool_use", id: "tu1", name: "TaskCreate", input: { subject: "Task A" } },
      { type: "tool_use", id: "tu2", name: "TaskCreate", input: { subject: "Task B" } },
    ];
    const { groups, grouped } = groupTaskBlocks(blocks);
    expect(groups.size).toBe(1);
    expect(grouped.size).toBe(2);
    const group = groups.get(0)!;
    expect(group.type).toBe("create");
    expect(group.inlineItems).toHaveLength(2);
    expect(group.inlineItems[0].content).toBe("Task A");
    expect(group.inlineItems[1].content).toBe("Task B");
  });

  it("breaks group when non-task block appears", () => {
    const blocks: ParsedContent[] = [
      { type: "tool_use", id: "tu1", name: "TaskCreate", input: { subject: "A" } },
      { type: "text", text: "some text" },
      { type: "tool_use", id: "tu2", name: "TaskUpdate", input: { taskId: "1", status: "completed" } },
    ];
    const { groups } = groupTaskBlocks(blocks);
    expect(groups.size).toBe(2);
    expect(groups.get(0)!.type).toBe("create");
    expect(groups.get(2)!.type).toBe("update");
  });

  it("uses snapshot type for TodoWrite", () => {
    const blocks: ParsedContent[] = [
      {
        type: "tool_use",
        id: "tu1",
        name: "TodoWrite",
        input: {
          todos: [
            { content: "Item 1", status: "pending" },
            { content: "Item 2", status: "completed" },
          ],
        },
      },
    ];
    const { groups } = groupTaskBlocks(blocks);
    const group = groups.get(0)!;
    expect(group.type).toBe("snapshot");
    expect(group.inlineItems).toHaveLength(2);
    expect(group.inlineItems[0].content).toBe("Item 1");
    expect(group.inlineItems[1].status).toBe("completed");
  });

  it("TodoWrite replaces previous inline items in the same run", () => {
    const blocks: ParsedContent[] = [
      { type: "tool_use", id: "tu1", name: "TaskCreate", input: { subject: "Old" } },
      {
        type: "tool_use",
        id: "tu2",
        name: "TodoWrite",
        input: { todos: [{ content: "New", status: "pending" }] },
      },
    ];
    const { groups } = groupTaskBlocks(blocks);
    const group = groups.get(0)!;
    expect(group.type).toBe("snapshot");
    // TodoWrite should have replaced the TaskCreate inline items
    expect(group.inlineItems).toHaveLength(1);
    expect(group.inlineItems[0].content).toBe("New");
  });
});
