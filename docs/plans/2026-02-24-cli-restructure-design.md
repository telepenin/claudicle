# CLI Restructure: Resource-First Commands

## Problem

Current CLI uses verb-first dispatch (`claudicle setup ui`, `claudicle install collector`) with inconsistencies: `claudicle start` is UI-only, `claudicle status` shows everything, `claudicle build ui` mixes with `claudicle update`. Mental model is unclear.

## Decision

Switch to resource-first dispatch: `claudicle ui <action>`, `claudicle collector <action>`. Each resource owns all its operations. No top-level shortcuts.

## Command Tree

```
claudicle ui build          --base-path /claudicle
claudicle ui update
claudicle ui install        --port 3001 --systemd|--launchd
claudicle ui setup          --port 3001 --systemd|--launchd
claudicle ui start
claudicle ui stop
claudicle ui status

claudicle collector install --systemd|--launchd
claudicle collector setup   --systemd|--launchd
claudicle collector start
claudicle collector stop
claudicle collector status

claudicle config init       (save ClickHouse credentials)
claudicle init              (initialize ClickHouse schema)
```

## Directory Layout

```
cli/lib/
  ui/
    build.js        Build UI from source with custom base path
    install.js      Download/use cached UI + register system service
    setup.js        config init + schema init + install (orchestrator)
    start.js        Manual foreground start via PID file
    stop.js         Stop PID-based server
    status.js       Show UI version, port, running state
    update.js       Download latest UI release
  collector/
    install.js      Download collector binary + generate config + register service
    setup.js        config init + schema init + install (orchestrator)
    start.js        Start systemd/launchd service
    stop.js         Stop systemd/launchd service
    status.js       Show collector version, binary path, service state
  commands/
    config.js       Config dispatcher (config init)
    init.js         ClickHouse schema init
  install/
    service.js              Shared: systemd/launchd generators + installers
    platform.js             Shared: OS/arch detection, service type detection
    otelcol-config.js       Shared: collector config generation
    collector-downloader.js Shared: collector binary download
```

## Entry Point

Two-level dispatch in `cli/bin/claudicle.js`:

- `argv[2]` = resource (`ui`, `collector`) or top-level command (`config`, `init`)
- `argv[3]` = action (for resources)

Resource groups dynamically import `cli/lib/{resource}/{action}.js`. Top-level commands import `cli/lib/commands/{command}.js` as before.

## Collector start/stop

New commands that manage systemd/launchd services directly:

- `start` runs `systemctl --user start claudicle-collector` or `launchctl bootstrap`
- `stop` runs `systemctl --user stop claudicle-collector` or `launchctl bootout`
- `status` shows collector version, binary path, config path, service running state

## Files Deleted

- `cli/lib/commands/start.js` (moved to `cli/lib/ui/start.js`)
- `cli/lib/commands/stop.js` (moved to `cli/lib/ui/stop.js`)
- `cli/lib/commands/status.js` (moved to `cli/lib/ui/status.js`)
- `cli/lib/commands/update.js` (moved to `cli/lib/ui/update.js`)
- `cli/lib/commands/build.js` (moved to `cli/lib/ui/build.js`)
- `cli/lib/commands/install.js` (dispatch hub, no longer needed)
- `cli/lib/commands/setup.js` (dispatch hub, no longer needed)
- `cli/lib/install/ui.js` (moved to `cli/lib/ui/install.js`)
- `cli/lib/install/collector.js` (moved to `cli/lib/collector/install.js`)

## Ansible Impact

Update roles in `momus/dev-utils/ansible/roles/claudicle/`:

- `ui/tasks/main.yaml`: `claudicle build ui` + `claudicle ui setup`
- `client/tasks/main.yaml`: `claudicle collector setup`
