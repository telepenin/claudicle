import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatCost,
  formatTokens,
  formatDuration,
  formatDurationMinutes,
  formatRelativeTime,
  extractProject,
} from "./format";

describe("formatCost", () => {
  it("returns $0.00 for zero", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("uses 4 decimals for sub-cent values", () => {
    expect(formatCost(0.0012)).toBe("$0.0012");
    expect(formatCost(0.0099)).toBe("$0.0099");
  });

  it("uses 2 decimals for normal values", () => {
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(12.345)).toBe("$12.35");
  });
});

describe("formatTokens", () => {
  it("returns raw number below 1k", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
  });

  it("formats thousands with k suffix", () => {
    expect(formatTokens(1000)).toBe("1.0k");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(999999)).toBe("1000.0k");
  });

  it("formats millions with M suffix", () => {
    expect(formatTokens(1_000_000)).toBe("1.0M");
    expect(formatTokens(2_500_000)).toBe("2.5M");
  });
});

describe("formatDuration", () => {
  it("formats sub-second as ms", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("formats seconds", () => {
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(30_000)).toBe("30s");
    expect(formatDuration(59_000)).toBe("59s");
  });

  it("formats minutes + seconds", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(3_599_000)).toBe("59m 59s");
  });

  it("formats hours + minutes", () => {
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(5_400_000)).toBe("1h 30m");
  });
});

describe("formatDurationMinutes", () => {
  it("formats minutes below 60", () => {
    expect(formatDurationMinutes(0)).toBe("0m");
    expect(formatDurationMinutes(45)).toBe("45m");
    expect(formatDurationMinutes(59)).toBe("59m");
  });

  it("formats 60 as 1h", () => {
    expect(formatDurationMinutes(60)).toBe("1h");
  });

  it("formats mixed hours + minutes", () => {
    expect(formatDurationMinutes(90)).toBe("1h 30m");
    expect(formatDurationMinutes(150)).toBe("2h 30m");
  });
});

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns seconds ago for recent timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:30Z"));
    expect(formatRelativeTime("2025-01-01T00:00:00Z")).toBe("30s ago");
  });

  it("returns minutes ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:05:00Z"));
    expect(formatRelativeTime("2025-01-01T00:00:00Z")).toBe("5m ago");
  });

  it("returns hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T03:00:00Z"));
    expect(formatRelativeTime("2025-01-01T00:00:00Z")).toBe("3h ago");
  });

  it("returns days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-05T00:00:00Z"));
    expect(formatRelativeTime("2025-01-01T00:00:00Z")).toBe("4d ago");
  });

  it("returns locale date for old timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T00:00:00Z"));
    const result = formatRelativeTime("2025-01-01T00:00:00Z");
    // Should be a locale date string, not "Xd ago"
    expect(result).not.toContain("ago");
  });

  it("returns 'just now' for future timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    expect(formatRelativeTime("2025-01-01T00:01:00Z")).toBe("just now");
  });
});

describe("extractProject", () => {
  it("extracts project from macOS path", () => {
    expect(
      extractProject(
        "/Users/alice/.claude/projects/-Users-alice-src-myapp/abc123.jsonl"
      )
    ).toBe("src-myapp");
  });

  it("extracts project from Linux path", () => {
    expect(
      extractProject(
        "/home/bob/.claude/projects/-home-bob-work-project/abc.jsonl"
      )
    ).toBe("work-project");
  });

  it("returns ~ when only home dir prefix", () => {
    expect(
      extractProject(
        "/Users/alice/.claude/projects/-Users-alice/uuid.jsonl"
      )
    ).toBe("~");
  });

  it("returns full path when no projects match", () => {
    expect(extractProject("/some/random/path.jsonl")).toBe(
      "/some/random/path.jsonl"
    );
  });
});
