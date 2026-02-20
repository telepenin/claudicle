# Session Archive Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `GET /api/logs/[id]/archive` that streams a `<session-id>.tar.gz` reconstructed from ClickHouse, preserving the full `~/.claude/projects/` directory structure so it can be extracted directly to restore the session on any machine.

**Architecture:** Reconstruct each JSONL file by grouping `mv_jsonl_messages.raw` rows by `file_path` and joining lines in timestamp order. Strip the host-absolute prefix (`/Users/xxx/.claude/projects/`) from each `file_path` to produce a portable archive path that starts with the encoded project dir (e.g. `-Users-xxx-src-project/`). Pack using `tar-stream` + Node's built-in `zlib.createGzip()` into an in-memory Buffer, then return as a streaming response.

**Tech Stack:** `tar-stream` (new dep), `node:zlib`, Next.js App Router API route, `@clickhouse/client`

---

### Task 1: Install tar-stream

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

```bash
npm install tar-stream
npm install --save-dev @types/tar-stream
```

**Step 2: Verify it's in package.json**

```bash
grep tar-stream package.json
```
Expected: `"tar-stream": "^x.x.x"` in `dependencies`.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add tar-stream for session archive export"
```

---

### Task 2: Add getSessionFiles query

**Files:**
- Modify: `src/lib/queries.ts`
- Modify: `src/lib/types.ts`

**Step 1: Add the `SessionFile` type to `src/lib/types.ts`**

```typescript
export interface SessionFile {
  archive_path: string;  // path relative to ~/.claude/projects/
  content: string;       // full JSONL content (rows joined with \n)
}
```

**Step 2: Add `getSessionFiles` to `src/lib/queries.ts`**

Add after the existing imports. The query fetches all rows for a session ordered by file_path + timestamp, then groups them in JS to reconstruct each JSONL file:

```typescript
/**
 * Extract the portable archive path from an absolute file_path.
 * Strips everything up to and including ".claude/projects/" so the
 * result starts with the encoded project dir, e.g.:
 *   /Users/nick/.claude/projects/-Users-nick-src-proj/abc.jsonl
 *   → -Users-nick-src-proj/abc.jsonl
 */
function toArchivePath(filePath: string): string {
  const marker = ".claude/projects/";
  const idx = filePath.indexOf(marker);
  return idx === -1 ? filePath : filePath.slice(idx + marker.length);
}

export async function getSessionFiles(
  sessionId: string
): Promise<SessionFile[]> {
  const result = await clickhouse.query({
    query: `
      SELECT file_path, raw
      FROM mv_jsonl_messages
      WHERE session_id = {sessionId:String}
      ORDER BY file_path, msg_timestamp ASC
    `,
    query_params: { sessionId },
    format: "JSONEachRow",
  });

  const rows = await result.json<{ file_path: string; raw: string }>();

  // Group by file_path, preserving insertion order (already sorted)
  const fileMap = new Map<string, string[]>();
  for (const row of rows) {
    const lines = fileMap.get(row.file_path) ?? [];
    lines.push(row.raw);
    fileMap.set(row.file_path, lines);
  }

  return [...fileMap.entries()].map(([filePath, lines]) => ({
    archive_path: toArchivePath(filePath),
    content: lines.join("\n") + "\n",
  }));
}
```

**Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | tail -20
```
Expected: no type errors.

**Step 4: Commit**

```bash
git add src/lib/queries.ts src/lib/types.ts
git commit -m "feat: add getSessionFiles query for archive export"
```

---

### Task 3: Implement the archive API route

**Files:**
- Create: `src/app/api/logs/[id]/archive/route.ts`

**Step 1: Create the route file**

```typescript
import { NextRequest } from "next/server";
import { pack } from "tar-stream";
import { createGzip } from "node:zlib";
import { getSessionFiles } from "@/lib/queries";

export const dynamic = "force-dynamic";

async function buildTarGz(
  files: { archive_path: string; content: string }[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tarPack = pack();
    const gzip = createGzip();
    const chunks: Buffer[] = [];

    gzip.on("data", (chunk: Buffer) => chunks.push(chunk));
    gzip.on("end", () => resolve(Buffer.concat(chunks)));
    gzip.on("error", reject);
    tarPack.on("error", reject);

    tarPack.pipe(gzip);

    let i = 0;
    function addNext() {
      if (i >= files.length) {
        tarPack.finalize();
        return;
      }
      const { archive_path, content } = files[i++];
      const buf = Buffer.from(content, "utf-8");
      tarPack.entry({ name: archive_path, size: buf.length }, buf, (err) => {
        if (err) reject(err);
        else addNext();
      });
    }
    addNext();
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const files = await getSessionFiles(id);

    if (files.length === 0) {
      return new Response("No files found for this session.\n", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const tarGz = await buildTarGz(files);

    return new Response(tarGz, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${id}.tar.gz"`,
        "Content-Length": String(tarGz.length),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("GET /api/logs/[id]/archive error:", message);
    return new Response(`Error: ${message}\n`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
```

**Step 2: Verify it builds**

```bash
npm run build 2>&1 | tail -20
```
Expected: clean build, new route appears as `ƒ /api/logs/[id]/archive`.

**Step 3: Smoke-test with curl**

Pick any session ID from the UI, then:

```bash
SESSION_ID=<paste-a-real-session-id>
curl -s "http://localhost:3001/api/logs/${SESSION_ID}/archive" \
  -o /tmp/session.tar.gz && \
  tar -tzf /tmp/session.tar.gz
```

Expected output lists files like:
```
-Users-nick-src-ai-claudicle/<session-id>.jsonl
-Users-nick-src-ai-claudicle/<session-id>/subagents/agent-aXXXXXX.jsonl
```

**Step 4: Verify restore works**

```bash
mkdir /tmp/restore-test
tar -xzf /tmp/session.tar.gz -C /tmp/restore-test
ls /tmp/restore-test/
```
Expected: the encoded project directory with the session JSONL inside.

**Step 5: Commit**

```bash
git add src/app/api/logs/[id]/archive/route.ts
git commit -m "feat: add GET /api/logs/[id]/archive — tar.gz session export"
```

---

### Task 4: Add Download button to the log detail UI

**Files:**
- Modify: `src/components/log-conversation.tsx` (lines 114–140, the controls bar)

**Step 1: Add a download link to the controls bar**

In the `{/* Controls bar */}` div (after the Rendered/Raw toggle), add:

```tsx
{/* Download archive */}
<a
  href={`/api/logs/${sessionId}/archive`}
  download
  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
>
  <Download className="h-3.5 w-3.5" />
  Download .tar.gz
</a>
```

Also add `Download` to the lucide-react import at the top of the file:

```typescript
import { Download } from "lucide-react";
```

**Step 2: Verify it builds**

```bash
npm run build 2>&1 | tail -10
```

**Step 3: Manual check**

Open a session in the UI — the "Download .tar.gz" link should appear next to the Rendered/Raw toggle. Clicking it downloads the archive.

**Step 4: Commit**

```bash
git add src/components/log-conversation.tsx
git commit -m "feat: add Download .tar.gz button to session detail page"
```
