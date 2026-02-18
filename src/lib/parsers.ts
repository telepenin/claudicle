// Pure parser functions extracted from tool-renderers.tsx for testability.

// ─── Diff ─────────────────────────────────────────────────────────────────

export type DiffLine = { type: "keep" | "del" | "add"; text: string };

export function diffLines(oldStr: string, newStr: string): DiffLine[] {
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

// ─── Read line-numbered ───────────────────────────────────────────────────

export function parseLineNumbered(text: string): { lineNo: number; code: string }[] {
  return text.split("\n").map((raw) => {
    const m = raw.match(/^\s*(\d+)→(.*)$/);
    if (m) return { lineNo: Number(m[1]), code: m[2] };
    return { lineNo: 0, code: raw };
  });
}

// ─── Grep result ──────────────────────────────────────────────────────────

export type GrepResultLine =
  | { kind: "match"; file: string; lineNo: number; code: string; isMatch: boolean }
  | { kind: "file"; path: string }
  | { kind: "text"; text: string };

export function parseGrepResult(text: string): GrepResultLine[] {
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

// ─── WebSearch content ────────────────────────────────────────────────────

export function parseSearchContent(text: string): { links: { title: string; url: string }[]; markdown: string } {
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

// ─── AskUserQuestion answers ──────────────────────────────────────────────

export function parseAnswers(text: string): Map<string, { answer: string; notes?: string }> {
  const result = new Map<string, { answer: string; notes?: string }>();
  // Match pairs: "question"="answer" optionally followed by user notes: ...
  const re = /"([^"]+)"="([^"]+)"(?:\s+user notes:\s*([^,"]*))?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    result.set(m[1], { answer: m[2], notes: m[3]?.trim() || undefined });
  }
  return result;
}
