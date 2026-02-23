import { describe, it, expect } from "vitest";
import { escapeXml, generateSystemdUnit, generateLaunchdPlist } from "./service.js";

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

describe("generateSystemdUnit", () => {
  it("produces valid unit content", () => {
    const unit = generateSystemdUnit(
      "claudicle-collector",
      "Claudicle OTel Collector",
      "/usr/local/bin/otelcol-contrib --config /etc/otelcol.yaml",
      { CLICKHOUSE_USER: "claude", CLICKHOUSE_PASSWORD: "secret" }
    );

    expect(unit).toContain("[Unit]");
    expect(unit).toContain("Description=Claudicle OTel Collector");
    expect(unit).toContain("[Service]");
    expect(unit).toContain("ExecStart=/usr/local/bin/otelcol-contrib --config /etc/otelcol.yaml");
    expect(unit).toContain("Environment=CLICKHOUSE_USER=claude");
    expect(unit).toContain("Environment=CLICKHOUSE_PASSWORD=secret");
    expect(unit).toContain("Restart=on-failure");
    expect(unit).toContain("[Install]");
    expect(unit).toContain("WantedBy=default.target");
  });

  it("works without env vars", () => {
    const unit = generateSystemdUnit("test", "Test service", "/bin/test");
    expect(unit).toContain("ExecStart=/bin/test");
    expect(unit).not.toContain("Environment=");
  });
});

describe("generateLaunchdPlist", () => {
  it("produces valid plist XML", () => {
    const plist = generateLaunchdPlist(
      "com.claudicle.collector",
      "Claudicle OTel Collector",
      ["/usr/local/bin/otelcol-contrib", "--config", "/etc/otelcol.yaml"],
      { CLICKHOUSE_USER: "claude" }
    );

    expect(plist).toContain('<?xml version="1.0"');
    expect(plist).toContain("<key>Label</key>");
    expect(plist).toContain("<string>com.claudicle.collector</string>");
    expect(plist).toContain("<key>ProgramArguments</key>");
    expect(plist).toContain("<string>/usr/local/bin/otelcol-contrib</string>");
    expect(plist).toContain("<key>RunAtLoad</key>");
    expect(plist).toContain("<true/>");
    expect(plist).toContain("<key>KeepAlive</key>");
    expect(plist).toContain("<key>EnvironmentVariables</key>");
    expect(plist).toContain("<key>CLICKHOUSE_USER</key>");
    expect(plist).toContain("<string>claude</string>");
  });

  it("omits EnvironmentVariables when no env", () => {
    const plist = generateLaunchdPlist(
      "com.test",
      "Test",
      ["/bin/test"]
    );

    expect(plist).not.toContain("<key>EnvironmentVariables</key>");
  });

  it("escapes XML special characters in args", () => {
    const plist = generateLaunchdPlist(
      "com.test",
      "Test",
      ["/bin/test", "--password=a&b<c>"]
    );

    expect(plist).toContain("<string>--password=a&amp;b&lt;c&gt;</string>");
  });
});
