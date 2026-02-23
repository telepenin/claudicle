import { describe, it, expect, vi } from "vitest";
import { buildClickHouseUrl, runSQL } from "./clickhouse.js";

describe("buildClickHouseUrl", () => {
  it("builds URL with user, password, and database", () => {
    const url = buildClickHouseUrl("http://localhost:8123", "admin", "secret", "mydb");
    expect(url).toBe("http://localhost:8123/?user=admin&password=secret&database=mydb");
  });

  it("handles trailing slash in base URL", () => {
    const url = buildClickHouseUrl("http://localhost:8123/", "u", "p", "d");
    expect(url).toBe("http://localhost:8123/?user=u&password=p&database=d");
  });
});

describe("runSQL", () => {
  it("sends POST with SQL body to ClickHouse", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("Ok.\n") });
    const result = await runSQL("SELECT 1", {
      url: "http://localhost:8123",
      user: "u",
      password: "p",
      database: "d",
    }, mockFetch);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8123/?user=u&password=p&database=d",
      { method: "POST", body: "SELECT 1" }
    );
    expect(result).toBe("Ok.\n");
  });

  it("throws on HTTP error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });
    await expect(
      runSQL("SELECT 1", { url: "http://x:8123", user: "u", password: "p", database: "d" }, mockFetch)
    ).rejects.toThrow("ClickHouse error (401)");
  });
});
