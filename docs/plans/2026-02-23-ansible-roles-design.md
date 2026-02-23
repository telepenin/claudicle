# Design: Claudicle Ansible Roles for Momus Infrastructure

## Context

Claudicle runs three components: ClickHouse (data store), Next.js UI (dashboard), and OTel Collector (telemetry ingestion). Currently deployed manually via docker-compose + a shell script. This design adds Ansible roles to the momus `dev-utils/ansible/` tree so Claudicle can be deployed alongside existing momus infrastructure.

## Deployment Topology

```
Nodes (Claude Code users)          DB instance              Head instance
+---------------------+        +------------------+     +------------------+
|  Claude Code         |        |  ClickHouse       |     |  Next.js UI       |
|  > OTLP + JSONL      |        |  :8123 (HTTP)     |     |  :3001            |
|  otelcol-contrib ----+--TCP-->|  :9000 (native)   |<----|  queries CH       |
|  (systemd service)   |        |  (docker-compose) |     |  (docker)         |
+---------------------+        +------------------+     +------------------+
  claudicle/client               claudicle/server          claudicle/ui
```

- Nodes send OTel data directly to ClickHouse on the db host (TCP port 9000)
- UI on head queries ClickHouse on the db host (HTTP port 8123)

## Roles

### 1. `claudicle/server` (db host)

Deploys ClickHouse via docker-compose.

```
roles/claudicle/server/
  tasks/main.yaml
  files/
    docker-compose.yaml    # ClickHouse service only, network_mode: host
    init.sql               # Database schema (tables, MVs)
```

**tasks/main.yaml flow:**
1. `set_fact: compose_directory: /etc/claudicle/`
2. Ensure directory exists
3. Copy `docker-compose.yaml` + `init.sql` -> register changes
4. `docker_compose` with environment: `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DB`
5. `wait_for` ports 8123, 9000

**docker-compose.yaml:** ClickHouse only. `network_mode: host` (matches momus/db pattern). Creds passed via Ansible `environment:` block, not baked into the file.

### 2. `claudicle/ui` (head host)

Deploys Next.js dashboard as a Docker container.

```
roles/claudicle/ui/
  tasks/main.yaml
  files/
    docker-compose.yaml    # UI service only, network_mode: host
```

**tasks/main.yaml flow:**
1. `set_fact: compose_directory: /etc/claudicle-ui/`
2. Ensure directory, copy compose file -> register changes
3. `docker_compose` pull=yes, environment: `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DB`, `CLICKHOUSE_HOST` (db host IP)
4. `wait_for` port 3001

**docker-compose.yaml:** References published Docker image (not local build). `network_mode: host`.

### 3. `claudicle/client` (node hosts)

Installs otelcol-contrib binary, deploys config and systemd unit.

```
roles/claudicle/client/
  tasks/main.yaml
  templates/
    otelcol-config.yaml.j2    # Parameterized ClickHouse endpoint + paths
    otelcol.service.j2         # systemd unit file
```

**tasks/main.yaml flow:**
1. `set_fact: otelcol_version: "0.120.0"`, `otelcol_dir: /opt/otelcol`
2. Create directory
3. Download otelcol-contrib binary from GitHub releases (conditional: when binary absent or version mismatch)
4. Template `otelcol-config.yaml.j2` -> `/opt/otelcol/config.yaml` -> register
5. Template `otelcol.service.j2` -> `/etc/systemd/system/otelcol.service` -> register
6. `systemd: daemon_reload=true, enabled=true, state=restarted` (when config/unit changed)
7. `wait_for` port 4318

**Template parameters:**
- `clickhouse_host` -- db host IP (from group_vars/all)
- `clickhouse_user` / `clickhouse_password` -- shared creds
- `otelcol_user` -- system user running Claude Code (for $HOME in filelog paths)
- `clickhouse_db` -- database name (default: claude_logs)

## Variables

Added to `group_vars/all`:

```yaml
# Claudicle
clickhouse_user: claudicle
clickhouse_password: !vault |
  ...
clickhouse_db: claude_logs
clickhouse_host: "{{ postgres_host }}"   # same db instance
otelcol_version: "0.120.0"
otelcol_user: root                       # user whose ~/.claude/ has JSONL logs
```

## Playbook Integration

```yaml
# momus.yaml additions:

# db section:
- role: claudicle/server
  tags: [ 'claudicle', 'claudicle/server' ]

# head section:
- role: claudicle/ui
  tags: [ 'claudicle', 'claudicle/ui' ]

# node section:
- role: claudicle/client
  tags: [ 'claudicle', 'claudicle/client' ]
```

## Conventions

Follows momus Ansible patterns:
- `set_fact` for local vars at top of tasks
- `copy` for static files, `template` for parameterized files
- `register` + conditional `restarted` for idempotent restarts
- `wait_for` port checks after service start
- `network_mode: host` for all containers
- Creds in `group_vars/all` with ansible-vault encryption
- Tags follow `project/role` naming
