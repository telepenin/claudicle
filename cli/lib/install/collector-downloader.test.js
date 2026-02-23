import { describe, it, expect } from "vitest";
import { getCollectorAssetUrl, getLatestCollectorVersion } from "./collector-downloader.js";

describe("getCollectorAssetUrl", () => {
  it("builds correct URL for linux/amd64", () => {
    expect(getCollectorAssetUrl("0.115.0", "linux", "amd64")).toBe(
      "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.115.0/otelcol-contrib_0.115.0_linux_amd64.tar.gz"
    );
  });

  it("builds correct URL for darwin/arm64", () => {
    expect(getCollectorAssetUrl("0.115.0", "darwin", "arm64")).toBe(
      "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.115.0/otelcol-contrib_0.115.0_darwin_arm64.tar.gz"
    );
  });
});

describe("getLatestCollectorVersion", () => {
  it("parses version from GitHub API response", async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ tag_name: "v0.115.0" }),
    });

    const version = await getLatestCollectorVersion(mockFetch);
    expect(version).toBe("0.115.0");
  });

  it("throws on API error", async () => {
    const mockFetch = async () => ({ ok: false, status: 403 });
    await expect(getLatestCollectorVersion(mockFetch)).rejects.toThrow("GitHub API error (403)");
  });

  it("throws on invalid version format", async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ tag_name: "nightly" }),
    });

    await expect(getLatestCollectorVersion(mockFetch)).rejects.toThrow("Invalid version format");
  });
});
