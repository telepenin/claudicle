import { describe, it, expect } from "vitest";
import {
  diffLines,
  parseLineNumbered,
  parseGrepResult,
  parseSearchContent,
  parseAnswers,
} from "./parsers";

describe("diffLines", () => {
  it("returns all keep lines for identical strings", () => {
    const result = diffLines("a\nb\nc", "a\nb\nc");
    expect(result).toEqual([
      { type: "keep", text: "a" },
      { type: "keep", text: "b" },
      { type: "keep", text: "c" },
    ]);
  });

  it("returns all del + add for complete replacement", () => {
    const result = diffLines("a\nb", "x\ny");
    const types = result.map((r) => r.type);
    expect(types).toContain("del");
    expect(types).toContain("add");
    expect(types).not.toContain("keep");
  });

  it("handles mixed changes", () => {
    const result = diffLines("a\nb\nc", "a\nx\nc");
    expect(result[0]).toEqual({ type: "keep", text: "a" });
    expect(result[result.length - 1]).toEqual({ type: "keep", text: "c" });
    // Middle should have del b and add x
    const mid = result.slice(1, -1);
    expect(mid).toContainEqual({ type: "del", text: "b" });
    expect(mid).toContainEqual({ type: "add", text: "x" });
  });

  it("handles empty old string (del empty + additions)", () => {
    const result = diffLines("", "a\nb");
    // "".split("\n") → [""], so there's a del "" for the empty line
    expect(result).toEqual([
      { type: "del", text: "" },
      { type: "add", text: "a" },
      { type: "add", text: "b" },
    ]);
  });

  it("handles empty new string (deletions + add empty)", () => {
    const result = diffLines("a\nb", "");
    // "".split("\n") → [""], so there's an add "" for the empty line
    expect(result).toEqual([
      { type: "del", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "" },
    ]);
  });
});

describe("parseLineNumbered", () => {
  it("parses arrow-formatted lines", () => {
    const result = parseLineNumbered("  1\u2192const x = 1;\n  2\u2192const y = 2;");
    expect(result).toEqual([
      { lineNo: 1, code: "const x = 1;" },
      { lineNo: 2, code: "const y = 2;" },
    ]);
  });

  it("falls back to lineNo 0 for non-matching lines", () => {
    const result = parseLineNumbered("plain text\nanother line");
    expect(result).toEqual([
      { lineNo: 0, code: "plain text" },
      { lineNo: 0, code: "another line" },
    ]);
  });

  it("handles mixed matching and non-matching", () => {
    const result = parseLineNumbered("  10\u2192code\nplain");
    expect(result[0]).toEqual({ lineNo: 10, code: "code" });
    expect(result[1]).toEqual({ lineNo: 0, code: "plain" });
  });
});

describe("parseGrepResult", () => {
  it("parses single-file match lines", () => {
    const result = parseGrepResult("42:const foo = 1;");
    expect(result).toEqual([
      { kind: "match", file: "", lineNo: 42, code: "const foo = 1;", isMatch: true },
    ]);
  });

  it("parses single-file context lines", () => {
    const result = parseGrepResult("42-context line");
    expect(result).toEqual([
      { kind: "match", file: "", lineNo: 42, code: "context line", isMatch: false },
    ]);
  });

  it("parses multi-file match lines", () => {
    const result = parseGrepResult("src/foo.ts:10:import bar");
    expect(result).toEqual([
      { kind: "match", file: "src/foo.ts", lineNo: 10, code: "import bar", isMatch: true },
    ]);
  });

  it("parses multi-file context lines", () => {
    const result = parseGrepResult("src/foo.ts-10-context");
    expect(result).toEqual([
      { kind: "match", file: "src/foo.ts", lineNo: 10, code: "context", isMatch: false },
    ]);
  });

  it("parses file-only lines", () => {
    const result = parseGrepResult("/path/to/file.ts");
    expect(result).toEqual([
      { kind: "file", path: "/path/to/file.ts" },
    ]);
  });

  it("parses text fallback", () => {
    const result = parseGrepResult("No matches found");
    expect(result).toEqual([
      { kind: "text", text: "No matches found" },
    ]);
  });

  it("filters empty lines", () => {
    const result = parseGrepResult("42:code\n\n43:more");
    expect(result).toHaveLength(2);
  });
});

describe("parseSearchContent", () => {
  it("extracts links and markdown", () => {
    const text = `Links: [{"title":"Example","url":"https://example.com"}]\nSome **markdown** content`;
    const result = parseSearchContent(text);
    expect(result.links).toEqual([{ title: "Example", url: "https://example.com" }]);
    expect(result.markdown).toBe("Some **markdown** content");
  });

  it("returns empty for no links", () => {
    const result = parseSearchContent("Just some text without links");
    expect(result.links).toEqual([]);
    expect(result.markdown).toBe("");
  });

  it("handles invalid JSON gracefully", () => {
    const text = "Links: [broken json]\nContent here";
    const result = parseSearchContent(text);
    expect(result.links).toEqual([]);
    expect(result.markdown).toBe("Content here");
  });

  it("strips trailing REMINDER lines", () => {
    const text = `Links: [{"title":"A","url":"https://a.com"}]\nContent\n\nREMINDER: Some system reminder text`;
    const result = parseSearchContent(text);
    expect(result.markdown).toBe("Content");
    expect(result.markdown).not.toContain("REMINDER");
  });
});

describe("parseAnswers", () => {
  it("parses single Q&A", () => {
    const text = `"Which approach?"="Option A"`;
    const result = parseAnswers(text);
    expect(result.get("Which approach?")).toEqual({ answer: "Option A", notes: undefined });
  });

  it("parses Q&A with notes", () => {
    const text = `"Which approach?"="Option A" user notes: I prefer this one`;
    const result = parseAnswers(text);
    expect(result.get("Which approach?")).toEqual({
      answer: "Option A",
      notes: "I prefer this one",
    });
  });

  it("parses multiple Q&A pairs", () => {
    const text = `"Q1"="A1", "Q2"="A2"`;
    const result = parseAnswers(text);
    expect(result.size).toBe(2);
    expect(result.get("Q1")?.answer).toBe("A1");
    expect(result.get("Q2")?.answer).toBe("A2");
  });

  it("returns empty map for empty string", () => {
    const result = parseAnswers("");
    expect(result.size).toBe(0);
  });
});
