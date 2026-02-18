# Claude Code JSONL Log Format Specification

> Reverse-engineered from Claude Code v2.1.44–2.1.45 session logs.
> Last updated: 2026-02-18.

## 1. Directory Structure

```
~/.claude/
  history.jsonl                          # Global user input history
  projects/
    <project-dir>/                       # One directory per project
      <session-uuid>.jsonl               # Main session transcript
      <session-uuid>/                    # Session artifacts directory
        subagents/
          agent-<short-hash>.jsonl       # Subagent conversation log
        tool-results/
          <short-hash>.txt               # Built-in tool output
          mcp-<plugin>-<tool>-<ts>.txt   # MCP tool output
```

### Project Directory Naming

The project directory name is the absolute path to the project root with `/` replaced by `-`:

| Project path | Directory name |
|---|---|
| `/Users/alice/src/myapp` | `-Users-alice-src-myapp` |
| `/private/var/folders/.../tmpXYZ` | `-private-var-folders-...-tmpXYZ` |

### Session Files

- **Name**: UUID v4 (e.g., `443661e2-a738-418d-a0a9-e7f0c36359f4.jsonl`)
- **Format**: Newline-delimited JSON (one JSON object per line)
- **Size**: Typically 10 KB to 8 MB per session
- **Ordering**: Chronological by `timestamp`

### Subagent Files

- **Name**: `agent-<7-char-hex>.jsonl` (e.g., `agent-aae4fe6.jsonl`)
- **Format**: Same JSONL format as session files
- **Content**: Only `user` and `assistant` message types (no progress/system/etc.)
- **Key field**: `agentId` matches the filename hash; `sessionId` references the parent session

### Tool Results Files

- **Built-in tools**: `<short-hash>.txt` — plain text stdout of tool execution
- **MCP tools**: `mcp-<plugin>-<tool>-<timestamp>.txt` — plain text output

---

## 2. Message Types

Every JSONL line has a top-level `type` field. Six message types exist:

| Type | Description | Frequency |
|---|---|---|
| `user` | User prompts and tool result delivery | Common |
| `assistant` | Claude's responses (one line per content block) | Common |
| `progress` | Tool/hook execution progress events | Very common |
| `system` | Metadata events (turn duration, compaction) | Rare |
| `queue-operation` | Subagent task queue operations | Occasional |
| `file-history-snapshot` | File backup state tracking | Occasional |

---

## 3. Common Fields

Most messages share these top-level fields:

| Field | Type | Description |
|---|---|---|
| `type` | string | Message type (see above) |
| `uuid` | string (UUID) | Unique identifier for this message |
| `parentUuid` | string (UUID) \| null | UUID of the preceding message in the chain |
| `timestamp` | string (ISO 8601) | When the message was recorded |
| `sessionId` | string (UUID) | Session this message belongs to |
| `cwd` | string | Working directory at time of message |
| `version` | string | Claude Code version (e.g., `"2.1.45"`) |
| `gitBranch` | string | Current git branch |
| `isSidechain` | boolean | `true` for subagent messages, `false` for main conversation |
| `userType` | string | Always `"external"` |

### UUID Chain (Message Tree)

Messages form a **singly-linked list** via `uuid` / `parentUuid`:

```
progress (parentUuid: null)
  └─► user (parentUuid → progress.uuid)
        └─► assistant/text (parentUuid → user.uuid)
              └─► assistant/thinking (parentUuid → prev assistant.uuid)
                    └─► assistant/tool_use (parentUuid → prev assistant.uuid)
                          └─► user/tool_result (parentUuid → assistant.uuid)
                                └─► assistant/text (parentUuid → user.uuid)
```

**Key rules:**
- Each message's `parentUuid` points to the immediately preceding message's `uuid`
- Assistant turns are **split into multiple lines** — one per content block, chained sequentially
- `file-history-snapshot` messages have no `uuid`/`parentUuid` (standalone)
- Compaction events (`system/compact_boundary`) reset `parentUuid` to `null` and provide `logicalParentUuid` to preserve the logical thread

---

## 4. Message Type: `user`

User messages carry either human prompts or tool execution results.

### User Prompt

```json
{
  "type": "user",
  "uuid": "9137913e-...",
  "parentUuid": "b182467d-...",
  "timestamp": "2026-02-17T23:21:59.414Z",
  "sessionId": "443661e2-...",
  "cwd": "/Users/alice/src/myapp",
  "version": "2.1.45",
  "gitBranch": "main",
  "isSidechain": false,
  "userType": "external",
  "message": {
    "role": "user",
    "content": "check the clickhouse does has data?"
  },
  "thinkingMetadata": { "maxThinkingTokens": 31999 },
  "todos": [],
  "permissionMode": "default",
  "slug": "graceful-knitting-garden"
}
```

#### User-specific fields

| Field | Type | Description |
|---|---|---|
| `message.role` | string | Always `"user"` |
| `message.content` | string \| ContentBlock[] | The user's input text, or an array of content blocks |
| `thinkingMetadata` | object | `{ maxThinkingTokens: number }` — thinking budget |
| `todos` | array | Current todo list state (can be empty) |
| `permissionMode` | string | Permission mode (e.g., `"default"`) |
| `slug` | string | Human-readable session slug (may appear after first turn) |

### User Tool Result Delivery

When `message.content` is an array of `tool_result` blocks, this message delivers tool execution results back to Claude. It is **not** a human prompt.

```json
{
  "type": "user",
  "uuid": "2d5a4b0e-...",
  "parentUuid": "18c6c4c5-...",
  "sourceToolAssistantUUID": "18c6c4c5-...",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_01T5rS5nnjdsUHUaWHf1b2XU",
        "content": "otel_events\t0\nsession_logs\t56374",
        "is_error": false
      }
    ]
  }
}
```

#### Tool result linkage fields

| Field | Type | Description |
|---|---|---|
| `parentUuid` | string (UUID) | Points to the assistant message that issued the `tool_use` |
| `sourceToolAssistantUUID` | string (UUID) | Same as `parentUuid` — explicitly names the originating assistant message |

### Compact Summary (Context Continuation)

When Claude Code auto-compacts the conversation to fit context limits, it injects a special user message:

```json
{
  "type": "user",
  "isCompactSummary": true,
  "isVisibleInTranscriptOnly": true,
  "message": {
    "role": "user",
    "content": "This session is being continued from a previous conversation..."
  },
  "parentUuid": "1d1bd0c0-..."
}
```

| Field | Type | Description |
|---|---|---|
| `isCompactSummary` | boolean | `true` — flags this as a context continuation summary |
| `isVisibleInTranscriptOnly` | boolean | `true` — displayed in transcript but not sent verbatim to the model |

---

## 5. Message Type: `assistant`

Assistant messages contain Claude's responses. **Each content block in a single API response produces a separate JSONL line**, chained via `parentUuid`.

```json
{
  "type": "assistant",
  "uuid": "3f4df04b-...",
  "parentUuid": "9137913e-...",
  "timestamp": "2026-02-17T23:22:01.687Z",
  "sessionId": "443661e2-...",
  "requestId": "req_011CYEVyzbRUQoa2gQ3xzPp8",
  "message": {
    "model": "claude-opus-4-6",
    "id": "msg_01UsSJ1owCZbDq86XPLRa519",
    "type": "message",
    "role": "assistant",
    "content": [ ... ],
    "stop_reason": null,
    "stop_sequence": null,
    "usage": { ... }
  }
}
```

#### Assistant-specific fields

| Field | Type | Description |
|---|---|---|
| `requestId` | string | Anthropic API request ID (e.g., `"req_011C..."`) |
| `message.model` | string | Model used (e.g., `"claude-opus-4-6"`, `"claude-haiku-4-5-20251001"`) |
| `message.id` | string | Anthropic message ID (e.g., `"msg_01Us..."`) |
| `message.role` | string | Always `"assistant"` |
| `message.content` | ContentBlock[] | Array with exactly one content block per JSONL line |
| `message.stop_reason` | null | Always `null` in JSONL logs (not populated) |
| `message.stop_sequence` | null | Always `null` |
| `message.usage` | UsageObject | Token usage statistics (see below) |

#### Usage Object

```json
{
  "input_tokens": 3,
  "output_tokens": 11,
  "cache_creation_input_tokens": 3332,
  "cache_read_input_tokens": 29818,
  "cache_creation": {
    "ephemeral_5m_input_tokens": 0,
    "ephemeral_1h_input_tokens": 3332
  },
  "service_tier": "standard",
  "inference_geo": "not_available"
}
```

| Field | Type | Description |
|---|---|---|
| `input_tokens` | number | Non-cached input tokens |
| `output_tokens` | number | Generated output tokens |
| `cache_creation_input_tokens` | number | Tokens written to prompt cache |
| `cache_read_input_tokens` | number | Tokens read from prompt cache |
| `cache_creation.ephemeral_5m_input_tokens` | number | 5-minute ephemeral cache tokens |
| `cache_creation.ephemeral_1h_input_tokens` | number | 1-hour ephemeral cache tokens |
| `service_tier` | string | API service tier (e.g., `"standard"`) |
| `inference_geo` | string | Inference region (e.g., `"not_available"`) |

---

## 6. Content Block Types

The `message.content` array contains content blocks. Four types exist:

### `text`

Plain text output from the model.

```json
{
  "type": "text",
  "text": "Here is my response..."
}
```

| Field | Type | Description |
|---|---|---|
| `type` | `"text"` | |
| `text` | string | The text content (may contain markdown) |

### `thinking`

Claude's internal chain-of-thought reasoning. Only appears in assistant messages.

```json
{
  "type": "thinking",
  "thinking": "The user wants to check if ClickHouse has data...",
  "signature": "Ep0CCkYICxgCKkCTbaHpH7Bnf4hFZd..."
}
```

| Field | Type | Description |
|---|---|---|
| `type` | `"thinking"` | |
| `thinking` | string | The reasoning text |
| `signature` | string | Cryptographic signature for verification |

### `tool_use`

A tool invocation request from Claude.

```json
{
  "type": "tool_use",
  "id": "toolu_01T5rS5nnjdsUHUaWHf1b2XU",
  "name": "Bash",
  "input": {
    "command": "docker compose exec clickhouse clickhouse-client ...",
    "description": "Check ClickHouse tables"
  },
  "caller": {
    "type": "direct"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `type` | `"tool_use"` | |
| `id` | string | Unique tool use ID (e.g., `"toolu_01T5..."`) — matches `tool_result.tool_use_id` |
| `name` | string | Tool name (see Tool Names section below) |
| `input` | object | Tool-specific input parameters |
| `caller` | object | Call origin — observed: `{"type": "direct"}` |

### `tool_result`

Tool execution result. Only appears inside `user` messages.

```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_01T5rS5nnjdsUHUaWHf1b2XU",
  "content": "output text here...",
  "is_error": false
}
```

| Field | Type | Description |
|---|---|---|
| `type` | `"tool_result"` | |
| `tool_use_id` | string | References the `tool_use.id` that produced this result |
| `content` | string \| TextBlock[] | Result text, or array of `{type: "text", text: "..."}` objects |
| `is_error` | boolean \| null | `true` if the tool execution failed; `false` or `null` on success |

**Content variants:**
- **String** (most common): Plain text output from the tool
- **Array**: List of `{type: "text", text: "..."}` objects. Appears when results come from subagents or multi-part responses.

---

## 7. Tool Names

Built-in tools observed in session logs:

| Tool | Input Fields | Description |
|---|---|---|
| `Bash` | `command`, `description`, `timeout` | Execute shell commands |
| `Read` | `file_path`, `offset`, `limit` | Read file contents |
| `Write` | `file_path`, `content` | Write/overwrite a file |
| `Edit` | `file_path`, `old_string`, `new_string`, `replace_all` | String replacement in files |
| `Glob` | `pattern`, `path` | Find files by glob pattern |
| `Grep` | `pattern`, `path`, `glob`, `output_mode` | Search file contents |
| `Task` | `prompt`, `description`, `subagent_type` | Launch a subagent |
| `TaskCreate` | `subject`, `description`, `activeForm` | Create a todo task |
| `TaskUpdate` | `taskId`, `status`, `subject`, `description` | Update a todo task |
| `TaskOutput` | `task_id`, `block`, `timeout` | Read subagent output |
| `AskUserQuestion` | `questions` | Ask the user a question |
| `Skill` | `skill`, `args` | Invoke a skill/slash command |

MCP tools follow the pattern: `mcp__<server>__<tool>` (e.g., `mcp__plugin_playwright_playwright__browser_navigate`).

---

## 8. Message Type: `progress`

Progress events track tool/hook execution state. They are the most frequent message type.

```json
{
  "type": "progress",
  "uuid": "b182467d-...",
  "parentUuid": null,
  "timestamp": "2026-02-17T23:21:45.192Z",
  "sessionId": "443661e2-...",
  "toolUseID": "758bd8b6-...",
  "parentToolUseID": "758bd8b6-...",
  "data": {
    "type": "hook_progress",
    "hookEvent": "SessionStart",
    "hookName": "SessionStart:startup",
    "command": "hooks/session-start.sh"
  }
}
```

#### Progress-specific fields

| Field | Type | Description |
|---|---|---|
| `toolUseID` | string | ID of the tool invocation being tracked |
| `parentToolUseID` | string | Parent tool use ID (same as `toolUseID` for top-level calls) |
| `data` | object | Progress payload — structure depends on `data.type` |

#### Progress `data.type` subtypes

| Subtype | Description | Additional `data` fields |
|---|---|---|
| `agent_progress` | Subagent execution progress | Streaming output, agent state |
| `hook_progress` | Hook execution progress | `hookEvent`, `hookName`, `command` |
| `bash_progress` | Bash command live output | Streaming stdout |
| `waiting_for_task` | Blocked waiting for async task | Task reference |

---

## 9. Message Type: `system`

System metadata events. Contains a `subtype` field.

#### Subtype: `turn_duration`

Marks the end of a conversational turn with timing data.

```json
{
  "type": "system",
  "subtype": "turn_duration",
  "durationMs": 62243,
  "slug": "graceful-knitting-garden",
  "isMeta": false,
  "timestamp": "2026-02-17T23:24:28.943Z"
}
```

| Field | Type | Description |
|---|---|---|
| `subtype` | `"turn_duration"` | |
| `durationMs` | number | Turn duration in milliseconds |
| `slug` | string | Human-readable session slug |
| `isMeta` | boolean | Metadata flag |

#### Subtype: `compact_boundary`

Conversation compaction event — inserted when context window is nearly full.

```json
{
  "type": "system",
  "subtype": "compact_boundary",
  "content": "Conversation compacted",
  "parentUuid": null,
  "logicalParentUuid": "3215a7aa-...",
  "compactMetadata": {
    "trigger": "auto",
    "preTokens": 167710
  }
}
```

| Field | Type | Description |
|---|---|---|
| `subtype` | `"compact_boundary"` | |
| `content` | string | `"Conversation compacted"` |
| `parentUuid` | null | Chain is reset at compaction |
| `logicalParentUuid` | string (UUID) | Preserves logical link to pre-compaction conversation |
| `compactMetadata.trigger` | string | `"auto"` for automatic compaction |
| `compactMetadata.preTokens` | number | Token count before compaction |

---

## 10. Message Type: `queue-operation`

Task queue operations for subagent and background task management.

#### Operation: `dequeue`

Signals that a task slot is available. Has no `content` field.

```json
{
  "type": "queue-operation",
  "operation": "dequeue",
  "timestamp": "2026-02-17T23:25:14.532Z",
  "sessionId": "443661e2-..."
}
```

#### Operation: `enqueue`

Queues a new task. The `content` field has two observed formats:

**Format 1: Subagent task (JSON)**

```json
{
  "type": "queue-operation",
  "operation": "enqueue",
  "timestamp": "2026-02-17T23:28:25.706Z",
  "sessionId": "443661e2-...",
  "content": "{\"task_id\":\"a7038ad\",\"description\":\"Explore current ClickHouse schema\",\"task_type\":\"local_agent\"}"
}
```

| Field | Type | Description |
|---|---|---|
| `task_id` | string | Short hash task ID matching subagent filename |
| `description` | string | Human-readable task description |
| `task_type` | string | Task type (observed: `"local_agent"`) |

**Format 2: Background task notification (XML-like)**

```json
{
  "type": "queue-operation",
  "operation": "enqueue",
  "timestamp": "2026-02-17T23:34:01.897Z",
  "sessionId": "443661e2-...",
  "content": "<task-notification>\n<task-id>b38ec1b</task-id>\n<output-file>/private/tmp/.../tasks/b38ec1b.output</output-file>\n<status>completed</status>\n<summary>Background command \"Find Maven binary location\" completed (exit code 0)</summary>\n</task-notification>\n..."
}
```

| Field | Type | Description |
|---|---|---|
| `operation` | string | `"enqueue"` or `"dequeue"` |
| `content` | string ǀ undefined | Serialized task descriptor (JSON or XML-like); absent for `dequeue` |

---

## 11. Message Type: `file-history-snapshot`

File backup state tracking. Standalone events (no `uuid`/`parentUuid` chain).

```json
{
  "type": "file-history-snapshot",
  "messageId": "9137913e-...",
  "snapshot": {
    "messageId": "9137913e-...",
    "trackedFileBackups": {},
    "timestamp": "2026-02-17T23:21:59.415Z"
  },
  "isSnapshotUpdate": false
}
```

| Field | Type | Description |
|---|---|---|
| `messageId` | string (UUID) | References the user/assistant message this snapshot accompanies |
| `snapshot.trackedFileBackups` | object | Map of file paths to backup metadata |
| `snapshot.timestamp` | string (ISO 8601) | Snapshot time |
| `isSnapshotUpdate` | boolean | `true` for incremental updates, `false` for full snapshots |

---

## 12. `history.jsonl` (Global History)

Located at `~/.claude/history.jsonl`. Records every user input across all sessions.

```json
{
  "display": "/plugin ",
  "pastedContents": {},
  "timestamp": 1770654699405,
  "project": "/Users/alice/src/myapp",
  "sessionId": "54794f8a-..."
}
```

| Field | Type | Description |
|---|---|---|
| `display` | string | User input text (prompt or slash command) |
| `pastedContents` | object | Map of pasted content (usually empty `{}`) |
| `timestamp` | number | Unix epoch milliseconds |
| `project` | string | Absolute path to project directory |
| `sessionId` | string (UUID) | Session the input was entered in |

---

## 13. Conversation Flow Diagram

A typical tool-use turn produces this sequence of JSONL lines:

```
Line 1:  type=assistant  content=[{type:"text", text:"Let me check..."}]
Line 2:  type=assistant  content=[{type:"thinking", thinking:"..."}]
Line 3:  type=assistant  content=[{type:"tool_use", id:"toolu_01X", name:"Bash", input:{...}}]
Line 4:  type=progress   data={type:"bash_progress", ...}    (0..N progress lines)
Line 5:  type=user       content=[{type:"tool_result", tool_use_id:"toolu_01X", content:"...", is_error:false}]
Line 6:  type=assistant  content=[{type:"text", text:"The output shows..."}]
```

**Rules:**
1. Each assistant content block is a **separate JSONL line** (not batched)
2. Lines 1–3 share the same `message.id` and `message.usage` but have different `uuid` values
3. Progress lines (line 4) are optional — appear for long-running tools
4. Tool result delivery (line 5) always follows the tool_use that requested it
5. The `tool_use.id` ↔ `tool_result.tool_use_id` pairing links request to response

### Multi-tool Calls

When Claude calls multiple tools in parallel, the assistant message produces multiple `tool_use` blocks (one per JSONL line), and the subsequent user message contains multiple `tool_result` blocks in a single message:

```
Line N:    type=assistant  content=[{type:"tool_use", id:"toolu_A", name:"Read", ...}]
Line N+1:  type=assistant  content=[{type:"tool_use", id:"toolu_B", name:"Grep", ...}]
Line N+2:  type=user       content=[
              {type:"tool_result", tool_use_id:"toolu_A", content:"..."},
              {type:"tool_result", tool_use_id:"toolu_B", content:"..."}
           ]
```

---

## 14. Subagent Lifecycle

When Claude uses the `Task` tool to spawn a subagent:

1. **Main session**: `assistant` message with `tool_use` block (`name: "Task"`)
2. **Main session**: `queue-operation` with `operation: "enqueue"` (task queued)
3. **Main session**: `progress` messages with `data.type: "agent_progress"` (streaming updates)
4. **Subagent file**: `agent-<hash>.jsonl` created in `<session>/subagents/` — contains its own `user`/`assistant` conversation
5. **Main session**: `user` message with `tool_result` containing the subagent's final output
6. **Main session**: Optionally, `progress` with `data.type: "waiting_for_task"` if blocked

Subagent files have `isSidechain: true` and `agentId` matching the filename hash. They share the parent `sessionId`.

---

## 15. Key Relationships

```
Session file (UUID.jsonl)
  │
  ├── uuid / parentUuid chain ──── linear message sequence
  │
  ├── assistant.message.content[].tool_use.id
  │     │
  │     └──── matches ──── user.message.content[].tool_result.tool_use_id
  │
  ├── user.sourceToolAssistantUUID
  │     │
  │     └──── matches ──── assistant.uuid (the one that issued tool_use)
  │
  ├── progress.toolUseID ──── references the active tool execution
  │
  ├── queue-operation.content.task_id
  │     │
  │     └──── matches ──── subagents/agent-<task_id>.jsonl filename
  │
  ├── file-history-snapshot.messageId
  │     │
  │     └──── matches ──── user.uuid or assistant.uuid
  │
  └── system.compact_boundary.logicalParentUuid
        │
        └──── matches ──── uuid of last message before compaction
```
