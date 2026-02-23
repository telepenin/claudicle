import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import {
  escapeXml,
  generateSystemdUnit,
  generateLaunchdPlist,
  readSystemdTemplate,
  readLaunchdTemplate,
} from "./service.js";
import { writeEnvFile } from "../config.js";

describe("escapeXml", () => {
  it("escapes ampersands", () => {
    expect(escapeXml("a&b")).toBe("a&amp;b");
  });

  it("escapes angle brackets", () => {
    expect(escapeXml("<tag>")).toBe("&lt;tag&gt;");
  });

  it("escapes quotes", () => {
    expect(escapeXml(`"it's"`)).toBe("&quot;it&apos;s&quot;");
  });

  it("handles strings with no special characters", () => {
    expect(escapeXml("hello")).toBe("hello");
  });

  it("coerces non-strings", () => {
    expect(escapeXml(42)).toBe("42");
  });
});

describe("writeEnvFile", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "claudicle-test-"));
    vi.stubEnv("CLAUDICLE_HOME", tmpDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes KEY=VALUE env file and returns the path", () => {
    const envPath = writeEnvFile("collector", {
      CLICKHOUSE_USER: "claude",
      CLICKHOUSE_PASSWORD: "secret",
    });

    expect(envPath).toBe(join(tmpDir, "collector.env"));
    const content = readFileSync(envPath, "utf-8");
    expect(content).toBe("CLICKHOUSE_USER=claude\nCLICKHOUSE_PASSWORD=secret\n");
  });

  it("writes ui env file with all variables", () => {
    const envPath = writeEnvFile("ui", {
      PORT: "3000",
      HOSTNAME: "0.0.0.0",
      NODE_ENV: "production",
      CLICKHOUSE_URL: "http://localhost:8123",
      CLICKHOUSE_USER: "claude",
      CLICKHOUSE_PASSWORD: "secret",
      CLICKHOUSE_DB: "claude_logs",
    });

    expect(envPath).toBe(join(tmpDir, "ui.env"));
    const content = readFileSync(envPath, "utf-8");
    expect(content).toContain("PORT=3000");
    expect(content).toContain("HOSTNAME=0.0.0.0");
    expect(content).toContain("NODE_ENV=production");
    expect(content).toContain("CLICKHOUSE_URL=http://localhost:8123");
    expect(content).toContain("CLICKHOUSE_USER=claude");
    expect(content).toContain("CLICKHOUSE_PASSWORD=secret");
    expect(content).toContain("CLICKHOUSE_DB=claude_logs");
  });
});

describe("readSystemdTemplate", () => {
  it("reads the collector systemd template with EnvironmentFile", () => {
    const template = readSystemdTemplate("collector");
    expect(template).toContain("[Unit]");
    expect(template).toContain("Description=Claudicle OTel Collector");
    expect(template).toContain("{{BINARY_PATH}} --config {{CONFIG_PATH}}");
    expect(template).toContain("EnvironmentFile={{ENV_FILE}}");
    expect(template).toContain("[Install]");
    // No inline Environment= lines
    expect(template).not.toMatch(/^Environment=/m);
  });

  it("reads the ui systemd template with EnvironmentFile", () => {
    const template = readSystemdTemplate("ui");
    expect(template).toContain("[Unit]");
    expect(template).toContain("Description=Claudicle UI Server");
    expect(template).toContain("{{NODE_PATH}} {{SERVER_JS}}");
    expect(template).toContain("EnvironmentFile={{ENV_FILE}}");
    expect(template).toContain("[Install]");
    expect(template).not.toMatch(/^Environment=/m);
  });
});

describe("readLaunchdTemplate", () => {
  it("reads the collector launchd template with shell wrapper", () => {
    const template = readLaunchdTemplate("collector");
    expect(template).toContain("<plist");
    expect(template).toContain("<string>com.claudicle.collector</string>");
    expect(template).toContain("<string>/bin/sh</string>");
    expect(template).toContain("{{ENV_FILE}}");
    expect(template).toContain("{{BINARY_PATH}}");
    expect(template).toContain("{{CONFIG_PATH}}");
    expect(template).toContain("{{LOGS_DIR}}/com.claudicle.collector.out.log");
    // No inline EnvironmentVariables
    expect(template).not.toContain("<key>EnvironmentVariables</key>");
  });

  it("reads the ui launchd template with shell wrapper", () => {
    const template = readLaunchdTemplate("ui");
    expect(template).toContain("<plist");
    expect(template).toContain("<string>com.claudicle.ui</string>");
    expect(template).toContain("<string>/bin/sh</string>");
    expect(template).toContain("{{ENV_FILE}}");
    expect(template).toContain("{{NODE_PATH}}");
    expect(template).toContain("{{SERVER_JS}}");
    expect(template).toContain("{{LOGS_DIR}}/com.claudicle.ui.out.log");
    expect(template).not.toContain("<key>EnvironmentVariables</key>");
  });
});

describe("generateSystemdUnit", () => {
  it("produces valid collector unit content", () => {
    const template = readSystemdTemplate("collector");
    const unit = generateSystemdUnit(template, {
      BINARY_PATH: "/usr/local/bin/otelcol-contrib",
      CONFIG_PATH: "/etc/otelcol.yaml",
      ENV_FILE: "/home/user/.claudicle/collector.env",
    });

    expect(unit).toContain("Description=Claudicle OTel Collector");
    expect(unit).toContain("ExecStart=/usr/local/bin/otelcol-contrib --config /etc/otelcol.yaml");
    expect(unit).toContain("EnvironmentFile=/home/user/.claudicle/collector.env");
    expect(unit).toContain("Restart=on-failure");
    expect(unit).toContain("WantedBy=default.target");
  });

  it("produces valid ui unit content", () => {
    const template = readSystemdTemplate("ui");
    const unit = generateSystemdUnit(template, {
      NODE_PATH: "/usr/bin/node",
      SERVER_JS: "/opt/claudicle/server.js",
      ENV_FILE: "/home/user/.claudicle/ui.env",
    });

    expect(unit).toContain("Description=Claudicle UI Server");
    expect(unit).toContain("ExecStart=/usr/bin/node /opt/claudicle/server.js");
    expect(unit).toContain("EnvironmentFile=/home/user/.claudicle/ui.env");
  });

  it("has no leftover placeholders", () => {
    const template = readSystemdTemplate("collector");
    const unit = generateSystemdUnit(template, {
      BINARY_PATH: "/bin/test",
      CONFIG_PATH: "/etc/test.yaml",
      ENV_FILE: "/tmp/test.env",
    });
    expect(unit).not.toContain("{{");
    expect(unit).not.toContain("}}");
  });
});

describe("generateLaunchdPlist", () => {
  it("produces valid collector plist XML", () => {
    const template = readLaunchdTemplate("collector");
    const plist = generateLaunchdPlist(template, {
      BINARY_PATH: "/usr/local/bin/otelcol-contrib",
      CONFIG_PATH: "/etc/otelcol.yaml",
      ENV_FILE: "/Users/test/.claudicle/collector.env",
    });

    expect(plist).toContain("<string>com.claudicle.collector</string>");
    expect(plist).toContain("<string>/bin/sh</string>");
    expect(plist).toContain("/Users/test/.claudicle/collector.env");
    expect(plist).toContain("/usr/local/bin/otelcol-contrib");
    expect(plist).toContain("<key>RunAtLoad</key>");
    expect(plist).toContain("<key>KeepAlive</key>");
  });

  it("produces valid ui plist XML", () => {
    const template = readLaunchdTemplate("ui");
    const plist = generateLaunchdPlist(template, {
      NODE_PATH: "/usr/bin/node",
      SERVER_JS: "/opt/claudicle/server.js",
      ENV_FILE: "/Users/test/.claudicle/ui.env",
    });

    expect(plist).toContain("<string>com.claudicle.ui</string>");
    expect(plist).toContain("/usr/bin/node");
    expect(plist).toContain("/opt/claudicle/server.js");
    expect(plist).toContain("/Users/test/.claudicle/ui.env");
  });

  it("has no leftover placeholders", () => {
    const template = readLaunchdTemplate("collector");
    const plist = generateLaunchdPlist(template, {
      BINARY_PATH: "/bin/test",
      CONFIG_PATH: "/etc/test.yaml",
      ENV_FILE: "/tmp/test.env",
    });
    expect(plist).not.toContain("{{");
    expect(plist).not.toContain("}}");
  });

  it("escapes XML special characters in values", () => {
    const template = readLaunchdTemplate("collector");
    const plist = generateLaunchdPlist(template, {
      BINARY_PATH: "/bin/test",
      CONFIG_PATH: "/etc/test.yaml",
      ENV_FILE: "/tmp/a&b<c>.env",
    });

    expect(plist).toContain("/tmp/a&amp;b&lt;c&gt;.env");
  });
});
