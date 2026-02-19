export interface CostOverTime {
  date: string;
  cost: number;
}

export interface TokensOverTime {
  date: string;
  input_tokens: number;
  output_tokens: number;
}

export interface TopModel {
  model: string;
  count: number;
  cost: number;
}

export interface TopTool {
  tool: string;
  count: number;
  avg_duration_ms: number;
}

export interface EventsByType {
  event_name: string;
  count: number;
}

export interface StatsResponse {
  totals: {
    sessions: number;
    events: number;
    cost: number;
    tokens: number;
  };
  cost_over_time: CostOverTime[];
  tokens_over_time: TokensOverTime[];
  top_models: TopModel[];
  top_tools: TopTool[];
  events_by_type: EventsByType[];
}

export interface LogSessionSummary {
  session_id: string;
  first_timestamp: string;
  last_timestamp: string;
  message_count: number;
  user_count: number;
  assistant_count: number;
  tool_count: number;
  project_path: string;
  subagent_count: number;
  error_count: number;
}

export interface LogListResponse {
  sessions: LogSessionSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface LogMessage {
  session_id: string;
  msg_type: string;
  msg_timestamp: string;
  raw: string;
  file: string;
  is_sidechain: boolean;
  agent_id: string;
}

export interface LogConversation {
  session_id: string;
  messages: LogMessage[];
  project_path: string;
}

export interface DashboardFilters {
  project?: string;
  environment?: string;
  team?: string;
  developer?: string;
}

export interface DimensionValues {
  projects: string[];
  environments: string[];
  teams: string[];
  developers: string[];
}
