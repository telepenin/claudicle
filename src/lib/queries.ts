import clickhouse from "@/lib/clickhouse";
import type {
  SessionSummary,
  SessionListResponse,
  SessionDetail,
  OtelEvent,
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
} from "@/lib/types";

export async function getSessionList(params: {
  page?: number;
  limit?: number;
  search?: string;
  from?: string;
  to?: string;
}): Promise<SessionListResponse> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  let whereClause =
    "WHERE ServiceName = 'claude-code' AND LogAttributes['session.id'] != ''";
  const queryParams: Record<string, string | number> = {};

  if (params.search) {
    whereClause += " AND LogAttributes['session.id'] LIKE {search:String}";
    queryParams.search = `%${params.search}%`;
  }
  if (params.from) {
    whereClause += " AND Timestamp >= {from:DateTime64(9)}";
    queryParams.from = params.from;
  }
  if (params.to) {
    whereClause += " AND Timestamp <= {to:DateTime64(9)}";
    queryParams.to = params.to;
  }

  const countResult = await clickhouse.query({
    query: `SELECT count(DISTINCT LogAttributes['session.id']) as total FROM otel_logs ${whereClause}`,
    query_params: queryParams,
    format: "JSONEachRow",
  });
  const countRows = await countResult.json<{ total: string }>();
  const total = Number(countRows[0]?.total ?? 0);

  const result = await clickhouse.query({
    query: `
      SELECT
        LogAttributes['session.id'] as session_id,
        min(Timestamp) as started_at,
        max(Timestamp) as last_activity,
        count() as event_count,
        sumIf(
          toFloat64OrZero(LogAttributes['cost_usd']),
          LogAttributes['event.name'] = 'api_request'
        ) as total_cost,
        sumIf(
          toFloat64OrZero(LogAttributes['input_tokens']),
          LogAttributes['event.name'] = 'api_request'
        ) as total_input_tokens,
        sumIf(
          toFloat64OrZero(LogAttributes['output_tokens']),
          LogAttributes['event.name'] = 'api_request'
        ) as total_output_tokens,
        anyIf(
          LogAttributes['model'],
          LogAttributes['event.name'] = 'api_request' AND LogAttributes['model'] != ''
        ) as model
      FROM otel_logs
      ${whereClause}
      GROUP BY LogAttributes['session.id']
      ORDER BY started_at DESC
      LIMIT {limit:UInt32}
      OFFSET {offset:UInt32}
    `,
    query_params: { ...queryParams, limit, offset },
    format: "JSONEachRow",
  });

  const sessions = await result.json<SessionSummary>();

  return { sessions, total, page, limit };
}

export async function getSessionDetail(
  sessionId: string
): Promise<SessionDetail> {
  const [eventsResult, summaryResult] = await Promise.all([
    clickhouse.query({
      query: `
        SELECT
          Timestamp as timestamp,
          LogAttributes['event.name'] as event_name,
          LogAttributes['session.id'] as session_id,
          SeverityText as severity_text,
          Body as message,
          ScopeName as scope_name,
          toUInt64OrZero(LogAttributes['event.sequence']) as event_sequence,
          LogAttributes['user.account_uuid'] as user_account_uuid,
          LogAttributes['organization.id'] as organization_id,
          LogAttributes['terminal.type'] as terminal_type,
          LogAttributes as attributes,
          ServiceName as service_name,
          ResourceAttributes['service.version'] as service_version,
          ResourceAttributes['os.type'] as os_type,
          ResourceAttributes['host.arch'] as host_arch
        FROM otel_logs
        WHERE LogAttributes['session.id'] = {sessionId:String}
          AND ServiceName = 'claude-code'
        ORDER BY Timestamp ASC
      `,
      query_params: { sessionId },
      format: "JSONEachRow",
    }),
    clickhouse.query({
      query: `
        SELECT
          LogAttributes['session.id'] as session_id,
          min(Timestamp) as started_at,
          max(Timestamp) as last_activity,
          count() as event_count,
          sumIf(
            toFloat64OrZero(LogAttributes['cost_usd']),
            LogAttributes['event.name'] = 'api_request'
          ) as total_cost,
          sumIf(
            toFloat64OrZero(LogAttributes['input_tokens']),
            LogAttributes['event.name'] = 'api_request'
          ) as total_input_tokens,
          sumIf(
            toFloat64OrZero(LogAttributes['output_tokens']),
            LogAttributes['event.name'] = 'api_request'
          ) as total_output_tokens,
          anyIf(
            LogAttributes['model'],
            LogAttributes['event.name'] = 'api_request' AND LogAttributes['model'] != ''
          ) as model
        FROM otel_logs
        WHERE LogAttributes['session.id'] = {sessionId:String}
          AND ServiceName = 'claude-code'
        GROUP BY LogAttributes['session.id']
      `,
      query_params: { sessionId },
      format: "JSONEachRow",
    }),
  ]);

  const events = await eventsResult.json<OtelEvent>();
  const summaryRows = await summaryResult.json<SessionSummary>();
  const summary = summaryRows[0] ?? {
    session_id: sessionId,
    started_at: "",
    last_activity: "",
    event_count: 0,
    total_cost: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    model: "",
  };

  return { session_id: sessionId, events, summary };
}

export async function getStats(): Promise<StatsResponse> {
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
          count(DISTINCT LogAttributes['session.id']) as sessions,
          count() as events,
          sum(toFloat64OrZero(LogAttributes['cost_usd'])) as cost,
          sum(toFloat64OrZero(LogAttributes['input_tokens'])) +
          sum(toFloat64OrZero(LogAttributes['output_tokens'])) as tokens
        FROM otel_logs
        WHERE ServiceName = 'claude-code'
          AND LogAttributes['session.id'] != ''
      `,
      format: "JSONEachRow",
    }),
    clickhouse.query({
      query: `
        SELECT
          toDate(Timestamp) as date,
          sum(toFloat64OrZero(LogAttributes['cost_usd'])) as cost
        FROM otel_logs
        WHERE ServiceName = 'claude-code'
          AND LogAttributes['event.name'] = 'api_request'
          AND Timestamp >= now() - INTERVAL 30 DAY
        GROUP BY date
        ORDER BY date
      `,
      format: "JSONEachRow",
    }),
    clickhouse.query({
      query: `
        SELECT
          toDate(Timestamp) as date,
          sum(toFloat64OrZero(LogAttributes['input_tokens'])) as input_tokens,
          sum(toFloat64OrZero(LogAttributes['output_tokens'])) as output_tokens
        FROM otel_logs
        WHERE ServiceName = 'claude-code'
          AND LogAttributes['event.name'] = 'api_request'
          AND Timestamp >= now() - INTERVAL 30 DAY
        GROUP BY date
        ORDER BY date
      `,
      format: "JSONEachRow",
    }),
    clickhouse.query({
      query: `
        SELECT
          LogAttributes['model'] as model,
          count() as count,
          sum(toFloat64OrZero(LogAttributes['cost_usd'])) as cost
        FROM otel_logs
        WHERE ServiceName = 'claude-code'
          AND LogAttributes['event.name'] = 'api_request'
          AND LogAttributes['model'] != ''
        GROUP BY model
        ORDER BY count DESC
        LIMIT 10
      `,
      format: "JSONEachRow",
    }),
    clickhouse.query({
      query: `
        SELECT
          LogAttributes['tool_name'] as tool,
          count() as count,
          avg(toFloat64OrZero(LogAttributes['duration_ms'])) as avg_duration_ms
        FROM otel_logs
        WHERE ServiceName = 'claude-code'
          AND LogAttributes['event.name'] = 'tool_result'
          AND LogAttributes['tool_name'] != ''
        GROUP BY tool
        ORDER BY count DESC
        LIMIT 10
      `,
      format: "JSONEachRow",
    }),
    clickhouse.query({
      query: `
        SELECT
          LogAttributes['event.name'] as event_name,
          count() as count
        FROM otel_logs
        WHERE ServiceName = 'claude-code'
          AND LogAttributes['event.name'] != ''
        GROUP BY event_name
        ORDER BY count DESC
      `,
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

export async function getLogSessionList(params: {
  page?: number;
  limit?: number;
  search?: string;
  from?: string;
  to?: string;
}): Promise<LogListResponse> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  let whereClause =
    "WHERE ResourceAttributes['source'] = 'claude_jsonl' AND LogAttributes['sessionId'] != ''";
  const queryParams: Record<string, string | number> = {};

  if (params.search) {
    whereClause +=
      " AND (LogAttributes['sessionId'] LIKE {search:String} OR ResourceAttributes['log.file.path'] LIKE {search:String})";
    queryParams.search = `%${params.search}%`;
  }
  if (params.from) {
    whereClause += " AND Timestamp >= {from:DateTime64(9)}";
    queryParams.from = params.from;
  }
  if (params.to) {
    whereClause += " AND Timestamp <= {to:DateTime64(9)}";
    queryParams.to = params.to;
  }

  const countResult = await clickhouse.query({
    query: `SELECT count(DISTINCT LogAttributes['sessionId']) as total FROM otel_logs ${whereClause}`,
    query_params: queryParams,
    format: "JSONEachRow",
  });
  const countRows = await countResult.json<{ total: string }>();
  const total = Number(countRows[0]?.total ?? 0);

  const result = await clickhouse.query({
    query: `
      SELECT
        LogAttributes['sessionId'] as session_id,
        min(Timestamp) as first_timestamp,
        max(Timestamp) as last_timestamp,
        count() as message_count,
        countIf(LogAttributes['type'] = 'user') as user_count,
        countIf(LogAttributes['type'] = 'assistant') as assistant_count,
        countIf(LogAttributes['type'] NOT IN ('user', 'assistant')) as tool_count,
        any(ResourceAttributes['log.file.path']) as project_path
      FROM otel_logs
      ${whereClause}
      GROUP BY LogAttributes['sessionId']
      ORDER BY first_timestamp DESC
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
        LogAttributes['sessionId'] as session_id,
        LogAttributes['type'] as msg_type,
        Timestamp as msg_timestamp,
        Body as raw,
        ResourceAttributes['log.file.path'] as file
      FROM otel_logs
      WHERE ResourceAttributes['source'] = 'claude_jsonl'
        AND LogAttributes['sessionId'] = {sessionId:String}
      ORDER BY Timestamp ASC
    `,
    query_params: { sessionId },
    format: "JSONEachRow",
  });

  const messages = await result.json<LogMessage>();
  const projectPath = messages[0]?.file ?? "";

  return { session_id: sessionId, messages, project_path: projectPath };
}
