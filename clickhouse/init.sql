-- Database creation (tables auto-managed by OTel Collector exporter)
CREATE DATABASE IF NOT EXISTS claude_logs;

-- The following tables are auto-created by the OTel Collector ClickHouse exporter:
--   claude_logs.otel_logs         (canonical OTel log schema)
--   claude_logs.otel_metrics_*    (gauge, sum, histogram, summary, exp_histogram)
--   claude_logs.otel_traces       (if traces are sent)
--
-- JSONL session logs also go into otel_logs, distinguished by:
--   ResourceAttributes['source'] = 'claude_jsonl'
--
-- See otelcol-config.yaml for the full pipeline configuration.
