---
name: claudicle-configure
description: Configure Claude Code telemetry for Claudicle — writes OTel env vars and resource attributes to .claude/settings.local.json
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - AskUserQuestion
argument-hint: "[--disable]"
---

Configure Claude Code to export telemetry to the local Claudicle OTel Collector.

## What you do

1. **Check claudicle is initialized**: Verify `~/.claudicle/` directory exists (created by `claudicle config init`). If `CLAUDICLE_HOME` env var is set, check that path instead. If the directory does not exist, stop and tell the user to run `claudicle config init` first (or `npx claudicle setup`).

2. **Check OTel Collector is running**: Run `lsof -iTCP:4318 -sTCP:LISTEN -t` to check if something is listening on port 4318. If nothing is listening, warn the user that the OTel Collector does not appear to be running on port 4318 and telemetry data will not be collected until it is started. Still proceed with configuration — this is a warning, not a blocker.

3. **Handle --disable flag**: If the user passed `--disable`, remove the telemetry env vars from `.claude/settings.local.json` instead of adding them. Remove these keys from the `env` object: `CLAUDE_CODE_ENABLE_TELEMETRY`, `OTEL_LOGS_EXPORTER`, `OTEL_METRICS_EXPORTER`, `OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_TOOL_DETAILS`, `OTEL_RESOURCE_ATTRIBUTES`. If the `env` object becomes empty, remove the `env` key entirely. Write the file and tell the user telemetry has been disabled and they should restart Claude Code.

4. **Read existing local settings**: Read `.claude/settings.local.json` in the current working directory. If it does not exist, start with an empty object `{}`.

5. **Merge env vars into settings.local.json**: Add or overwrite these keys in the `env` object:
   ```json
   {
     "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
     "OTEL_LOGS_EXPORTER": "otlp",
     "OTEL_METRICS_EXPORTER": "otlp",
     "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
     "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318",
     "OTEL_LOG_USER_PROMPTS": "1",
     "OTEL_LOG_TOOL_DETAILS": "1"
   }
   ```
   Preserve any existing keys in the `env` object that are not in this list. Preserve all other top-level keys in the settings object (like `permissions`).

6. **Configure resource attributes**: Check if `OTEL_RESOURCE_ATTRIBUTES` already exists in the `env` object. If it does, show the current value and ask the user if they want to keep or update it. If it does not exist, ask the user for values using AskUserQuestion with these options:
   - Suggest `project=<current directory name>,developer=<system username>` as the recommended default
   - Let the user provide custom `key=value` pairs
   - Let the user skip (no resource attributes)

   Available attribute keys: `project`, `environment`, `team`, `developer`. These appear as filter dropdowns in the Claudicle dashboard.

   If the user provides values, merge `OTEL_RESOURCE_ATTRIBUTES` into the `env` object.

7. **Write settings.local.json**: Write the merged JSON back to `.claude/settings.local.json` with 2-space indentation and a trailing newline.

8. **Report**: Tell the user:
   - Telemetry has been configured in `.claude/settings.local.json` (not committed to git)
   - List the env vars that were set
   - If resource attributes were configured, mention them
   - They need to restart Claude Code for the changes to take effect
   - Telemetry data will be sent to the local OTel Collector on `localhost:4318`

## Important

- All telemetry env vars (transport + resource attributes) go in `.claude/settings.local.json` (per-developer, NOT committed to git)
- Do NOT write telemetry env vars to `.claude/settings.json` — that file is for shared, committed settings only
- Do NOT add `CLAUDE_CODE_MAX_OUTPUT_TOKENS` — that is a user preference, not a telemetry setting
- Preserve all existing settings in the file — only merge the `env` key
- If `.claude/` directory does not exist, create it before writing
