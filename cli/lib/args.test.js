import { describe, it, expect } from "vitest";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
  it("parses --key value pairs", () => {
    const result = parseArgs(["--clickhouse-url", "http://host:8123", "--port", "4000"]);
    expect(result["clickhouse-url"]).toBe("http://host:8123");
    expect(result.port).toBe("4000");
  });

  it("parses --key=value syntax", () => {
    const result = parseArgs(["--user=admin"]);
    expect(result.user).toBe("admin");
  });

  it("returns empty object for no args", () => {
    expect(parseArgs([])).toEqual({});
  });

  it("ignores positional args", () => {
    const result = parseArgs(["something", "--port", "3000"]);
    expect(result.port).toBe("3000");
    expect(result.something).toBeUndefined();
  });
});
