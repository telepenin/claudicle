import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getConfigDir, readEnvFile, writeEnvFile, readState, writeState, resolveClickHouseConfig, resolveUiPort } from "./config.js";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "claudicle-test-" + Date.now());

describe("config", () => {
  beforeEach(() => {
    vi.stubEnv("CLAUDICLE_HOME", testDir);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("getConfigDir returns CLAUDICLE_HOME when set", () => {
    expect(getConfigDir()).toBe(testDir);
  });

  describe("readEnvFile / writeEnvFile", () => {
    it("returns {} when file does not exist", () => {
      expect(readEnvFile("collector")).toEqual({});
    });

    it("writes and reads KEY=VALUE pairs", () => {
      writeEnvFile("collector", {
        CLICKHOUSE_USER: "admin",
        CLICKHOUSE_PASSWORD: "secret",
      });
      const vars = readEnvFile("collector");
      expect(vars).toEqual({
        CLICKHOUSE_USER: "admin",
        CLICKHOUSE_PASSWORD: "secret",
      });
    });

    it("returns the absolute path", () => {
      const path = writeEnvFile("ui", { PORT: "3000" });
      expect(path).toBe(join(testDir, "ui.env"));
    });

    it("skips comments and blank lines", () => {
      const envPath = join(testDir, "test.env");
      writeFileSync(envPath, "# comment\n\nKEY=val\n\n# another\nFOO=bar\n");
      const vars = readEnvFile("test");
      expect(vars).toEqual({ KEY: "val", FOO: "bar" });
    });
  });

  describe("readState / writeState", () => {
    it("returns {} when state.json does not exist", () => {
      expect(readState()).toEqual({});
    });

    it("writes and reads state", () => {
      writeState({ version: "1.0.0" });
      expect(readState()).toEqual({ version: "1.0.0" });
    });

    it("shallow-merges with existing state", () => {
      writeState({ version: "1.0.0", collector_version: "0.115.0" });
      writeState({ version: "2.0.0" });
      expect(readState()).toEqual({ version: "2.0.0", collector_version: "0.115.0" });
    });
  });

  describe("resolveClickHouseConfig", () => {
    it("returns defaults when nothing is configured", () => {
      const config = resolveClickHouseConfig({});
      expect(config.url).toBe("http://localhost:8123");
      expect(config.database).toBe("claude_logs");
      expect(config.user).toBe("");
      expect(config.password).toBe("");
    });

    it("reads from env files", () => {
      writeEnvFile("collector", { CLICKHOUSE_USER: "envuser", CLICKHOUSE_PASSWORD: "envpass" });
      writeEnvFile("ui", { CLICKHOUSE_URL: "http://remote:8123", CLICKHOUSE_DB: "mydb" });
      const config = resolveClickHouseConfig({});
      expect(config.url).toBe("http://remote:8123");
      expect(config.user).toBe("envuser");
      expect(config.password).toBe("envpass");
      expect(config.database).toBe("mydb");
    });

    it("CLI args override env files", () => {
      writeEnvFile("collector", { CLICKHOUSE_USER: "envuser", CLICKHOUSE_PASSWORD: "envpass" });
      const config = resolveClickHouseConfig({ user: "cliuser", password: "clipass" });
      expect(config.user).toBe("cliuser");
      expect(config.password).toBe("clipass");
    });

    it("process env vars override env files", () => {
      writeEnvFile("collector", { CLICKHOUSE_USER: "envuser" });
      vi.stubEnv("CLICKHOUSE_USER", "processuser");
      const config = resolveClickHouseConfig({});
      expect(config.user).toBe("processuser");
    });
  });

  describe("resolveUiPort", () => {
    it("returns 3000 by default", () => {
      expect(resolveUiPort({})).toBe(3000);
    });

    it("reads from ui.env", () => {
      writeEnvFile("ui", { PORT: "4000" });
      expect(resolveUiPort({})).toBe(4000);
    });

    it("CLI arg overrides env file", () => {
      writeEnvFile("ui", { PORT: "4000" });
      expect(resolveUiPort({ port: "5000" })).toBe(5000);
    });
  });
});
