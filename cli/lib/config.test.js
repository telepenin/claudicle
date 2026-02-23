import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readConfig, writeConfig, getConfigDir } from "./config.js";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "claudicle-test-" + Date.now());

describe("config", () => {
  beforeEach(() => {
    process.env.CLAUDICLE_HOME = testDir;
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    delete process.env.CLAUDICLE_HOME;
  });

  it("getConfigDir returns CLAUDICLE_HOME when set", () => {
    expect(getConfigDir()).toBe(testDir);
  });

  it("readConfig returns defaults when no config file exists", () => {
    const config = readConfig();
    expect(config.clickhouse.url).toBe("http://localhost:8123");
    expect(config.clickhouse.database).toBe("claude_logs");
    expect(config.ui.port).toBe(3000);
  });

  it("writeConfig creates config file and readConfig reads it back", () => {
    const config = {
      clickhouse: {
        url: "http://remote:8123",
        user: "admin",
        password: "secret",
        database: "mydb",
      },
      ui: { port: 4000 },
      collector: { version: null },
      version: "1.5.0",
    };
    writeConfig(config);
    const read = readConfig();
    expect(read).toEqual(config);
  });

  it("writeConfig merges with existing config", () => {
    writeConfig({ clickhouse: { url: "http://a:8123", user: "u", password: "p", database: "d" }, ui: { port: 3000 }, version: "1.0.0" });
    writeConfig({ ui: { port: 5000 } });
    const read = readConfig();
    expect(read.clickhouse.url).toBe("http://a:8123");
    expect(read.ui.port).toBe(5000);
  });
});
