import clickhouse from "@/lib/clickhouse";
import type {
  StatsResponse,
  CostOverTime,
  TokensOverTime,
  TopModel,
  TopTool,
  EventsByType,
  LogSessionSummary,
  LogListResponse,
  LogMessage,
  LogConversation,
  DashboardFilters,
  DimensionValues,
  SessionFile,
} from "@/lib/types";

const DIMENSION_KEYS = ["project", "environment", "team", "developer"] as const;

/**
 * Build a filter clause for the otel_events typed table.
 * Uses plain column references instead of Map access.
 */
function buildOtelFilterClause(filters?: DashboardFilters): {
  clause: string;
  params: Record<string, string>;
} {
  if (!filters) return { clause: "", params: {} };
  let clause = "";
  const params: Record<string, string> = {};
  for (const key of DIMENSION_KEYS) {
    const value = filters[key];
    if (value) {
      clause += ` AND ${key} = {filter_${key}:String}`;
      params[`filter_${key}`] = value;
    }
  }
  return { clause, params };
}

export async function getDimensions(
  filters?: DashboardFilters
): Promise<DimensionValues> {
  // For each dimension, apply all OTHER filters so the dropdown still shows
  // all values for itself but narrows based on sibling selections.
  const results = await Promise.all(
    DIMENSION_KEYS.map((key) => {
      const otherFilters: DashboardFilters = {};
      if (filters) {
        for (const k of DIMENSION_KEYS) {
          if (k !== key && filters[k]) otherFilters[k] = filters[k];
        }
      }
      const { clause, params } = buildOtelFilterClause(
        Object.keys(otherFilters).length > 0 ? otherFilters : undefined
      );
      return clickhouse
        .query({
          query: `
            SELECT DISTINCT ${key} AS value
            FROM otel_events
            WHERE 1=1
              ${clause}
            ORDER BY value
          `,
          query_params: params,
          format: "JSONEachRow",
        })
        .then((r) => r.json<{ value: string }>())
        .then((rows) => rows.map((r) => r.value));
    })
  );
  return {
    projects: results[0],
    environments: results[1],
    teams: results[2],
    developers: results[3],
  };
}

export async function getStats(
  filters?: DashboardFilters
): Promise<StatsResponse> {
  const { clause: filterClause, params: filterParams } =
    buildOtelFilterClause(filters);

  const [
    totalsResult,
    costResult,
    tokensResult,
    modelsResult,
    toolsResult,
    eventTypesResult,
  ] = await Promise.all([
    clickhouse.query({
      query: `
        SELECT
          count(DISTINCT session_id) as sessions,
          count() as events,
          sum(cost_usd) as cost,
          sum(input_tokens) + sum(output_tokens) as tokens
        FROM otel_events
        WHERE session_id != ''
          ${filterClause}
      `,
      query_params: filterParams,
      format: "JSONEachRow",
    }),
    clickhouse.query({
      query: `
        SELECT
          toDate(ts) as date,
          sum(cost_usd) as cost
        FROM otel_events
        WHERE event_name = 'api_request'
          AND ts >= now() - INTERVAL 30 DAY
          ${filterClause}
        GROUP BY date
        ORDER BY date
      `,
      query_params: filterParams,
      format: "JSONEachRow",
    }),
    clickhouse.query({
      query: `
        SELECT
          toDate(ts) as date,
          sum(input_tokens) as input_tokens,
          sum(output_tokens) as output_tokens
        FROM otel_events
        WHERE event_name = 'api_request'
          AND ts >= now() - INTERVAL 30 DAY
          ${filterClause}
        GROUP BY date
        ORDER BY date
      `,
      query_params: filterParams,
      format: "JSONEachRow",
    }),
    clickhouse.query({
      query: `
        SELECT
          model,
          count() as count,
          sum(cost_usd) as cost
        FROM otel_events
        WHERE event_name = 'api_request'
          AND model != ''
          ${filterClause}
        GROUP BY model
        ORDER BY count DESC
        LIMIT 10
      `,
      query_params: filterParams,
      format: "JSONEachRow",
    }),
    clickhouse.query({
      query: `
        SELECT
          tool_name as tool,
          count() as count,
          avg(duration_ms) as avg_duration_ms,
          min(duration_ms) as min_duration_ms,
          max(duration_ms) as max_duration_ms,
          countIf(success = 'true') / count() * 100 as success_pct
        FROM otel_events
        WHERE event_name = 'tool_result'
          AND tool_name != ''
          ${filterClause}
        GROUP BY tool_name
        ORDER BY count DESC
        LIMIT 20
      `,
      query_params: filterParams,
      format: "JSONEachRow",
    }),
    clickhouse.query({
      query: `
        SELECT
          event_name,
          count() as count
        FROM otel_events
        WHERE event_name != ''
          ${filterClause}
        GROUP BY event_name
        ORDER BY count DESC
      `,
      query_params: filterParams,
      format: "JSONEachRow",
    }),
  ]);

  const totals = (
    await totalsResult.json<{
      sessions: string;
      events: string;
      cost: string;
      tokens: string;
    }>()
  )[0];

  const cost_over_time = await costResult.json<CostOverTime>();
  const tokens_over_time = await tokensResult.json<TokensOverTime>();
  const top_models = await modelsResult.json<TopModel>();
  const top_tools = await toolsResult.json<TopTool>();
  const events_by_type = await eventTypesResult.json<EventsByType>();

  return {
    totals: {
      sessions: Number(totals?.sessions ?? 0),
      events: Number(totals?.events ?? 0),
      cost: Number(totals?.cost ?? 0),
      tokens: Number(totals?.tokens ?? 0),
    },
    cost_over_time,
    tokens_over_time,
    top_models,
    top_tools,
    events_by_type,
  };
}

/**
 * Build a `session_id IN (...)` subquery that resolves dimension filters
 * against otel_events (which has typed dimension columns).
 * JSONL tables don't have dimension attributes, so we join by session ID.
 */
function buildSessionFilterClause(filters?: DashboardFilters): {
  clause: string;
  params: Record<string, string>;
} {
  if (!filters) return { clause: "", params: {} };
  const { clause: dimClause, params: dimParams } = buildOtelFilterClause(filters);
  if (!dimClause) return { clause: "", params: {} };
  return {
    clause: ` AND session_id IN (
      SELECT DISTINCT session_id
      FROM otel_events
      WHERE session_id != ''
        ${dimClause}
    )`,
    params: dimParams,
  };
}

export async function getLogSessionList(params: {
  page?: number;
  limit?: number;
  search?: string;
  from?: string;
  to?: string;
  filters?: DashboardFilters;
}): Promise<LogListResponse> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  const { clause: sessionFilterClause, params: sessionFilterParams } =
    buildSessionFilterClause(params.filters);
  const hasDimensionFilters = !!sessionFilterClause;
  const hasSearchFilters = params.search || params.from || params.to;
  const hasFilters = hasSearchFilters || hasDimensionFilters;

  // Fast path: use pre-aggregated MV when no filters
  if (!hasFilters) {
    const [countResult, result] = await Promise.all([
      clickhouse.query({
        query: `SELECT count() as total FROM (SELECT session_id FROM mv_jsonl_sessions GROUP BY session_id)`,
        format: "JSONEachRow",
      }),
      clickhouse.query({
        query: `
          SELECT
            session_id,
            minMerge(first_ts) AS first_timestamp,
            maxMerge(last_ts) AS last_timestamp,
            countMerge(message_count) AS message_count,
            countIfMerge(user_count) AS user_count,
            countIfMerge(assistant_count) AS assistant_count,
            countIfMerge(other_count) AS tool_count,
            anyMerge(project_path) AS project_path,
            uniqIfMerge(subagent_count) AS subagent_count,
            countIfMerge(error_count) AS error_count,
            countIfMerge(mcp_tool_count) AS mcp_tool_count
          FROM mv_jsonl_sessions
          GROUP BY session_id
          ORDER BY last_timestamp DESC
          LIMIT {limit:UInt32}
          OFFSET {offset:UInt32}
        `,
        query_params: { limit, offset },
        format: "JSONEachRow",
      }),
    ]);

    const countRows = await countResult.json<{ total: string }>();
    const total = Number(countRows[0]?.total ?? 0);
    const sessions = await result.json<LogSessionSummary>();
    return { sessions, total, page, limit };
  }

  // Filtered path: use jsonl_messages with typed columns
  let whereClause = "WHERE 1=1";
  const queryParams: Record<string, string | number> = {};

  if (params.search) {
    whereClause +=
      " AND (session_id LIKE {search:String} OR file_path LIKE {search:String})";
    queryParams.search = `%${params.search}%`;
  }
  if (params.from) {
    whereClause += " AND msg_timestamp >= {from:DateTime64(9)}";
    queryParams.from = params.from;
  }
  if (params.to) {
    whereClause += " AND msg_timestamp <= {to:DateTime64(9)}";
    queryParams.to = params.to;
  }
  if (sessionFilterClause) {
    whereClause += sessionFilterClause;
    Object.assign(queryParams, sessionFilterParams);
  }

  const countResult = await clickhouse.query({
    query: `SELECT count(DISTINCT session_id) as total FROM jsonl_messages ${whereClause}`,
    query_params: queryParams,
    format: "JSONEachRow",
  });
  const countRows = await countResult.json<{ total: string }>();
  const total = Number(countRows[0]?.total ?? 0);

  const result = await clickhouse.query({
    query: `
      SELECT
        session_id,
        min(msg_timestamp) as first_timestamp,
        max(msg_timestamp) as last_timestamp,
        count() as message_count,
        countIf(msg_type = 'user') as user_count,
        countIf(msg_type = 'assistant') as assistant_count,
        countIf(msg_type NOT IN ('user', 'assistant')) as tool_count,
        any(file_path) as project_path,
        uniqIf(agent_id, is_sidechain = 1 AND agent_id != '') as subagent_count,
        countIf(msg_type = 'user' AND is_sidechain = 0 AND (position(raw, '"is_error":true') > 0 OR position(raw, '"is_error": true') > 0)) as error_count,
        countIf(msg_type = 'assistant' AND position(raw, '"name":"mcp__') > 0) as mcp_tool_count
      FROM jsonl_messages
      ${whereClause}
      GROUP BY session_id
      ORDER BY last_timestamp DESC
      LIMIT {limit:UInt32}
      OFFSET {offset:UInt32}
    `,
    query_params: { ...queryParams, limit, offset },
    format: "JSONEachRow",
  });

  const sessions = await result.json<LogSessionSummary>();

  return { sessions, total, page, limit };
}

export async function getLogConversation(
  sessionId: string
): Promise<LogConversation> {
  const result = await clickhouse.query({
    query: `
      SELECT
        session_id,
        msg_type,
        msg_timestamp,
        raw,
        file_path as file,
        is_sidechain,
        agent_id
      FROM jsonl_messages
      WHERE session_id = {sessionId:String}
      ORDER BY msg_timestamp ASC
    `,
    query_params: { sessionId },
    format: "JSONEachRow",
  });

  const messages = await result.json<LogMessage>();
  const projectPath = messages[0]?.file ?? "";

  return { session_id: sessionId, messages, project_path: projectPath };
}

export async function getNewSessionMessages(
  sessionId: string,
  after: string
): Promise<LogMessage[]> {
  const result = await clickhouse.query({
    query: `
      SELECT
        session_id,
        msg_type,
        msg_timestamp,
        raw,
        file_path as file,
        is_sidechain,
        agent_id
      FROM jsonl_messages
      WHERE session_id = {sessionId:String}
        AND msg_timestamp > {after:String}
      ORDER BY msg_timestamp ASC
    `,
    query_params: { sessionId, after },
    format: "JSONEachRow",
  });

  return result.json<LogMessage>();
}

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
  // Filter by file_path containing the session UUID, not by session_id field.
  // The session_id field inside JSONL lines is NOT unique per file — resumed/continued
  // sessions carry the same sessionId but write to different JSONL files. The UUID
  // in the file path is the reliable identifier for which physical files belong here
  // (main JSONL + subagent files nested under <uuid>/subagents/).
  const result = await clickhouse.query({
    query: `
      SELECT file_path, raw
      FROM jsonl_messages
      WHERE file_path LIKE {pattern:String}
      ORDER BY file_path, msg_timestamp ASC
    `,
    query_params: { pattern: `%${sessionId}%` },
    format: "JSONEachRow",
  });

  const rows = await result.json<{ file_path: string; raw: string }>();

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
