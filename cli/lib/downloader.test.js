import { describe, it, expect } from "vitest";
import { getReleaseUrl, getInitSqlUrl } from "./downloader.js";

describe("getReleaseUrl", () => {
  it("builds tarball URL for a version", () => {
    expect(getReleaseUrl("1.2.0")).toBe(
      "https://github.com/telepenin/claudicle/releases/download/v1.2.0/claudicle-ui-v1.2.0.tar.gz"
    );
  });
});

describe("getInitSqlUrl", () => {
  it("builds init.sql URL for a version", () => {
    expect(getInitSqlUrl("1.2.0")).toBe(
      "https://github.com/telepenin/claudicle/releases/download/v1.2.0/init.sql"
    );
  });
});
