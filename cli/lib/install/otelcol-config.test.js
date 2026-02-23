import { describe, it, expect } from "vitest";
import { deriveClickHouseTcpEndpoint, generateCollectorConfig } from "./otelcol-config.js";

describe("deriveClickHouseTcpEndpoint", () => {
  it("converts default HTTP URL to TCP", () => {
    expect(deriveClickHouseTcpEndpoint("http://localhost:8123")).toBe(
      "tcp://localhost:9000?dial_timeout=10s"
    );
  });

  it("converts custom port", () => {
    expect(deriveClickHouseTcpEndpoint("http://db.example.com:18123")).toBe(
      "tcp://db.example.com:19000?dial_timeout=10s"
    );
  });

  it("handles https URL", () => {
    expect(deriveClickHouseTcpEndpoint("https://ch.internal:8123")).toBe(
      "tcp://ch.internal:9000?dial_timeout=10s"
    );
  });

  it("defaults to port 8123 when no port specified", () => {
    expect(deriveClickHouseTcpEndpoint("http://localhost")).toBe(
      "tcp://localhost:9000?dial_timeout=10s"
    );
  });
});

describe("generateCollectorConfig", () => {
  const chConfig = {
    url: "http://localhost:8123",
    user: "claude",
    password: "s3cret",
    database: "claude_logs",
  };

  it("substitutes all placeholders", () => {
    const config = generateCollectorConfig(chConfig);
    expect(config).not.toContain("{{");
    expect(config).not.toContain("}}");
  });

  it("contains correct TCP endpoint", () => {
    const config = generateCollectorConfig(chConfig);
    expect(config).toContain("endpoint: tcp://localhost:9000?dial_timeout=10s");
  });

  it("contains correct credentials", () => {
    const config = generateCollectorConfig(chConfig);
    expect(config).toContain("username: claude");
    expect(config).toContain('password: "s3cret"');
    expect(config).toContain("database: claude_logs");
  });

  it("quotes password in YAML for special characters", () => {
    const config = generateCollectorConfig({
      ...chConfig,
      password: "p@ss:word",
    });
    expect(config).toContain('password: "p@ss:word"');
  });

  it("contains OTLP receiver", () => {
    const config = generateCollectorConfig(chConfig);
    expect(config).toContain("endpoint: 127.0.0.1:4318");
  });

  it("contains filelog receiver for JSONL sessions", () => {
    const config = generateCollectorConfig(chConfig);
    expect(config).toContain("filelog/sessions:");
    expect(config).toContain(".claude/projects/**/*.jsonl");
  });
});
