# Claudicle Ansible Roles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create three Ansible roles (claudicle/server, claudicle/ui, claudicle/client) in the momus dev-utils/ansible tree to deploy Claudicle infrastructure.

**Architecture:** ClickHouse on db host via docker-compose, Next.js UI on head via docker-compose, OTel Collector on each node as a systemd service with downloaded binary. All containers use network_mode: host. Creds shared via group_vars/all with vault encryption.

**Tech Stack:** Ansible, Docker Compose, systemd, otelcol-contrib, ClickHouse, Next.js

**Design doc:** `docs/plans/2026-02-23-ansible-roles-design.md`

---

## Task 1: Create `claudicle/server` role (ClickHouse on db)

**Files:**
- Create: `momus/dev-utils/ansible/roles/claudicle/server/tasks/main.yaml`
- Create: `momus/dev-utils/ansible/roles/claudicle/server/files/docker-compose.yaml`
- Copy from: `claudicle/clickhouse/init.sql` -> `momus/dev-utils/ansible/roles/claudicle/server/files/init.sql`

**Step 1: Create role directory structure**

```bash
mkdir -p /Users/nikolaytelepenin/src/momus/dev-utils/ansible/roles/claudicle/server/{tasks,files}
```

**Step 2: Create `files/docker-compose.yaml`**

Static docker-compose file for ClickHouse. Follows momus/db pattern: `network_mode: host`, env vars passed at runtime via Ansible `environment:` block.

```yaml
services:
  clickhouse:
    container_name: claudicle-clickhouse
    image: clickhouse/clickhouse-server:latest
    network_mode: host
    restart: unless-stopped
    environment:
      CLICKHOUSE_USER: ${CLICKHOUSE_USER}
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD}
      CLICKHOUSE_DB: ${CLICKHOUSE_DB}
    volumes:
      - /var/local/clickhouse-data:/var/lib/clickhouse
      - /etc/claudicle/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD", "clickhouse-client", "--user", "${CLICKHOUSE_USER}", "--password", "${CLICKHOUSE_PASSWORD}", "--query", "SELECT 1"]
      interval: 5s
      timeout: 3s
      retries: 10
```

**Step 3: Copy `init.sql`**

Copy `/Users/nikolaytelepenin/src/ai/claudicle/clickhouse/init.sql` to the role's `files/init.sql` verbatim.

**Step 4: Create `tasks/main.yaml`**

```yaml
- set_fact:
    compose_directory: /etc/claudicle/

- name: Ensure claudicle directory exists
  file:
    path: "{{ compose_directory }}"
    state: directory

- name: Copy compose file
  copy:
    src: docker-compose.yaml
    dest: "{{ compose_directory }}/docker-compose.yaml"
  register: compose_file

- name: Copy ClickHouse init SQL
  copy:
    src: init.sql
    dest: "{{ compose_directory }}/init.sql"
  register: init_sql

- name: Run ClickHouse
  docker_compose:
    project_src: "{{ compose_directory }}"
    pull: yes
    restarted: "{{ compose_file.changed or init_sql.changed }}"
    services:
      - clickhouse
    files:
      - docker-compose.yaml
  environment:
    CLICKHOUSE_USER: "{{ clickhouse_user }}"
    CLICKHOUSE_PASSWORD: "{{ clickhouse_password }}"
    CLICKHOUSE_DB: "{{ clickhouse_db }}"

- name: Wait for ClickHouse ports
  wait_for:
    port: "{{ item }}"
    timeout: 30
  with_items:
    - 8123
    - 9000
```

**Step 5: Commit**

```bash
cd /Users/nikolaytelepenin/src/momus
git add dev-utils/ansible/roles/claudicle/server/
git commit -m "feat(ansible): add claudicle/server role for ClickHouse"
```

---

## Task 2: Create `claudicle/ui` role (Next.js on head)

**Files:**
- Create: `momus/dev-utils/ansible/roles/claudicle/ui/tasks/main.yaml`
- Create: `momus/dev-utils/ansible/roles/claudicle/ui/files/docker-compose.yaml`

**Step 1: Create role directory structure**

```bash
mkdir -p /Users/nikolaytelepenin/src/momus/dev-utils/ansible/roles/claudicle/ui/{tasks,files}
```

**Step 2: Create `files/docker-compose.yaml`**

Uses published image. `network_mode: host` so the UI can reach ClickHouse on the db host IP without Docker networking.

```yaml
services:
  claudicle-ui:
    container_name: claudicle-ui
    image: ghcr.io/nikolaytelepenin/claudicle:latest
    network_mode: host
    restart: unless-stopped
    environment:
      CLICKHOUSE_USER: ${CLICKHOUSE_USER}
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD}
      CLICKHOUSE_DB: ${CLICKHOUSE_DB}
      CLICKHOUSE_HOST: ${CLICKHOUSE_HOST}
      PORT: "3001"
      HOSTNAME: "0.0.0.0"
```

> **Note:** The image reference `ghcr.io/nikolaytelepenin/claudicle:latest` is a placeholder. Adjust to the actual registry/image name when published. Alternatively, build locally by copying the source and using `build: .` instead.

**Step 3: Create `tasks/main.yaml`**

```yaml
- set_fact:
    compose_directory: /etc/claudicle-ui/

- name: Ensure claudicle-ui directory exists
  file:
    path: "{{ compose_directory }}"
    state: directory

- name: Copy compose file
  copy:
    src: docker-compose.yaml
    dest: "{{ compose_directory }}/docker-compose.yaml"
  register: compose_file

- name: Run Claudicle UI
  docker_compose:
    project_src: "{{ compose_directory }}"
    pull: yes
    restarted: "{{ compose_file.changed }}"
    services:
      - claudicle-ui
    files:
      - docker-compose.yaml
  environment:
    CLICKHOUSE_USER: "{{ clickhouse_user }}"
    CLICKHOUSE_PASSWORD: "{{ clickhouse_password }}"
    CLICKHOUSE_DB: "{{ clickhouse_db }}"
    CLICKHOUSE_HOST: "{{ clickhouse_host }}"

- name: Wait for UI port
  wait_for:
    port: 3001
    timeout: 30
```

**Step 4: Commit**

```bash
cd /Users/nikolaytelepenin/src/momus
git add dev-utils/ansible/roles/claudicle/ui/
git commit -m "feat(ansible): add claudicle/ui role for Next.js dashboard"
```

---

## Task 3: Create `claudicle/client` role (OTel Collector on nodes)

**Files:**
- Create: `momus/dev-utils/ansible/roles/claudicle/client/tasks/main.yaml`
- Create: `momus/dev-utils/ansible/roles/claudicle/client/templates/otelcol-config.yaml.j2`
- Create: `momus/dev-utils/ansible/roles/claudicle/client/templates/otelcol.service.j2`

**Step 1: Create role directory structure**

```bash
mkdir -p /Users/nikolaytelepenin/src/momus/dev-utils/ansible/roles/claudicle/client/{tasks,templates}
```

**Step 2: Create `templates/otelcol-config.yaml.j2`**

Parameterizes the ClickHouse endpoint and user home directory. Based on `claudicle/configs/otelcol-config.yaml`.

```yaml
# OpenTelemetry Collector config — deployed by Ansible claudicle/client role
# Receives OTLP from Claude Code + tails JSONL session logs -> ClickHouse

receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

  filelog/sessions:
    include:
      - /home/{{ otelcol_user }}/.claude/projects/**/*.jsonl
    storage: file_storage
    start_at: beginning
    include_file_path: true
    poll_interval: 2s
    max_concurrent_files: 100
    max_batches: 10
    operators:
      - type: json_parser
        parse_from: body
        parse_to: attributes
      - type: time_parser
        if: 'attributes.timestamp != nil'
        parse_from: attributes.timestamp
        layout: "2006-01-02T15:04:05.000Z07:00"
        layout_type: gotime

extensions:
  file_storage:
    directory: /var/local/otelcol-storage

processors:
  batch:
    send_batch_size: 5000
    timeout: 5s

  batch/sessions:
    send_batch_size: 500
    timeout: 5s

  memory_limiter:
    check_interval: 1s
    limit_mib: 1024
    spike_limit_mib: 256

  resource/sessions:
    attributes:
      - key: source
        value: claude_jsonl
        action: insert
      - key: service.name
        value: claude-jsonl
        action: insert

  transform/sessions:
    log_statements:
      - context: log
        statements:
          - set(resource.attributes["log.file.path"], attributes["log.file.path"])

exporters:
  clickhouse:
    endpoint: tcp://{{ clickhouse_host }}:9000?dial_timeout=10s
    username: {{ clickhouse_user }}
    password: {{ clickhouse_password }}
    database: {{ clickhouse_db }}
    create_schema: true
    async_insert: true
    compress: lz4
    logs_table_name: otel_logs
    traces_table_name: otel_traces
    retry_on_failure:
      enabled: true

service:
  extensions: [file_storage]
  telemetry:
    logs:
      level: info
  pipelines:
    logs/otel:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [clickhouse]
    logs/sessions:
      receivers: [filelog/sessions]
      processors: [memory_limiter, resource/sessions, transform/sessions, batch/sessions]
      exporters: [clickhouse]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [clickhouse]
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [clickhouse]
```

**Step 3: Create `templates/otelcol.service.j2`**

Follows momus celery.service.j2 pattern.

```ini
[Unit]
Description=Claudicle OTel Collector
After=network.target

[Service]
Type=simple
ExecStart=/opt/otelcol/otelcol-contrib --config /opt/otelcol/config.yaml
Restart=on-failure
RestartSec=5s
WorkingDirectory=/opt/otelcol
Environment=HOME=/home/{{ otelcol_user }}

[Install]
WantedBy=multi-user.target
```

**Step 4: Create `tasks/main.yaml`**

```yaml
- set_fact:
    otelcol_dir: /opt/otelcol
    otelcol_arch: amd64

- name: Ensure otelcol directory exists
  file:
    path: "{{ otelcol_dir }}"
    state: directory

- name: Check if otelcol-contrib binary exists
  stat:
    path: "{{ otelcol_dir }}/otelcol-contrib"
  register: otelcol_binary

- name: Download otelcol-contrib
  get_url:
    url: "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v{{ otelcol_version }}/otelcol-contrib_{{ otelcol_version }}_linux_{{ otelcol_arch }}.tar.gz"
    dest: /tmp/otelcol-contrib.tar.gz
  when: not otelcol_binary.stat.exists

- name: Extract otelcol-contrib
  unarchive:
    src: /tmp/otelcol-contrib.tar.gz
    dest: "{{ otelcol_dir }}"
    remote_src: yes
  when: not otelcol_binary.stat.exists

- name: Ensure storage directory exists
  file:
    path: /var/local/otelcol-storage
    state: directory

- name: Deploy OTel Collector config
  template:
    src: otelcol-config.yaml.j2
    dest: "{{ otelcol_dir }}/config.yaml"
  register: otelcol_config

- name: Deploy OTel Collector systemd unit
  template:
    src: otelcol.service.j2
    dest: /usr/lib/systemd/system/claudicle-otelcol.service
  register: otelcol_unit

- name: Restart OTel Collector
  systemd:
    name: claudicle-otelcol
    state: restarted
    enabled: true
    daemon_reload: true
  when: otelcol_config.changed or otelcol_unit.changed or not otelcol_binary.stat.exists

- name: Ensure OTel Collector is started
  systemd:
    name: claudicle-otelcol
    state: started
    enabled: true
  when: not (otelcol_config.changed or otelcol_unit.changed or not otelcol_binary.stat.exists)

- name: Wait for OTLP port
  wait_for:
    port: 4318
    timeout: 30
```

**Step 5: Commit**

```bash
cd /Users/nikolaytelepenin/src/momus
git add dev-utils/ansible/roles/claudicle/client/
git commit -m "feat(ansible): add claudicle/client role for OTel Collector"
```

---

## Task 4: Add variables to `group_vars/all`

**Files:**
- Modify: `momus/dev-utils/ansible/group_vars/all`

**Step 1: Append claudicle variables**

Add to the end of `/Users/nikolaytelepenin/src/momus/dev-utils/ansible/group_vars/all`:

```yaml
# Claudicle (telemetry dashboard)
clickhouse_user: claudicle
clickhouse_password: <vault-encrypt-a-password>
clickhouse_db: claude_logs
clickhouse_host: "{{ postgres_host }}"
otelcol_version: "0.120.0"
otelcol_user: root
```

**Step 2: Vault-encrypt the password**

```bash
cd /Users/nikolaytelepenin/src/momus/dev-utils/ansible
ansible-vault encrypt_string '<chosen-password>' --name 'clickhouse_password'
```

Replace the `clickhouse_password` value with the vault output.

**Step 3: Commit**

```bash
cd /Users/nikolaytelepenin/src/momus
git add dev-utils/ansible/group_vars/all
git commit -m "feat(ansible): add claudicle variables to group_vars/all"
```

---

## Task 5: Wire roles into `momus.yaml` playbook

**Files:**
- Modify: `momus/dev-utils/ansible/momus.yaml`

**Step 1: Add claudicle/server to db section**

After the `momus/rabbitmq` role (line 10), add:

```yaml
    - role: claudicle/server
      tags: [ 'claudicle', 'claudicle/server' ]
```

**Step 2: Add claudicle/ui to head section**

After the `momus/mq-service` role (at the end of head section), add:

```yaml
    - role: claudicle/ui
      tags: [ 'claudicle', 'claudicle/ui' ]
```

**Step 3: Add claudicle/client to node section**

After the `momus/celery` role (end of node section), add:

```yaml
    - role: claudicle/client
      tags: [ 'claudicle', 'claudicle/client' ]
```

**Step 4: Commit**

```bash
cd /Users/nikolaytelepenin/src/momus
git add dev-utils/ansible/momus.yaml
git commit -m "feat(ansible): wire claudicle roles into momus.yaml playbook"
```

---

## Task 6: Test with dry-run

**Step 1: Syntax check**

```bash
cd /Users/nikolaytelepenin/src/momus/dev-utils/ansible
ansible-playbook momus.yaml --syntax-check
```

Expected: no errors.

**Step 2: Dry-run server role**

```bash
ansible-playbook momus.yaml --tags claudicle/server --check --diff
```

Expected: shows planned changes (create dirs, copy files, docker_compose).

**Step 3: Dry-run ui role**

```bash
ansible-playbook momus.yaml --tags claudicle/ui --check --diff
```

**Step 4: Dry-run client role**

```bash
ansible-playbook momus.yaml --tags claudicle/client --check --diff
```

**Step 5: Run for real (one role at a time)**

```bash
ansible-playbook momus.yaml --tags claudicle/server
ansible-playbook momus.yaml --tags claudicle/ui
ansible-playbook momus.yaml --tags claudicle/client
```
