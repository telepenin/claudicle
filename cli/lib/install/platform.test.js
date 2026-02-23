import { describe, it, expect } from "vitest";
import { detectPlatform, detectServiceType } from "./platform.js";

describe("detectPlatform", () => {
  it("maps darwin/x64 to darwin/amd64", () => {
    expect(detectPlatform("darwin", "x64")).toEqual({ os: "darwin", arch: "amd64" });
  });

  it("maps darwin/arm64 to darwin/arm64", () => {
    expect(detectPlatform("darwin", "arm64")).toEqual({ os: "darwin", arch: "arm64" });
  });

  it("maps linux/x64 to linux/amd64", () => {
    expect(detectPlatform("linux", "x64")).toEqual({ os: "linux", arch: "amd64" });
  });

  it("maps linux/arm64 to linux/arm64", () => {
    expect(detectPlatform("linux", "arm64")).toEqual({ os: "linux", arch: "arm64" });
  });

  it("throws for unsupported platform", () => {
    expect(() => detectPlatform("win32", "x64")).toThrow("Unsupported platform: win32");
  });

  it("throws for unsupported architecture", () => {
    expect(() => detectPlatform("linux", "ia32")).toThrow("Unsupported architecture: ia32");
  });
});

describe("detectServiceType", () => {
  it("returns systemd when --systemd flag is set", () => {
    expect(detectServiceType({ systemd: true })).toBe("systemd");
  });

  it("returns launchd when --launchd flag is set", () => {
    expect(detectServiceType({ launchd: true })).toBe("launchd");
  });

  it("returns null when no flag is set", () => {
    expect(detectServiceType({})).toBeNull();
  });

  it("returns null with no args", () => {
    expect(detectServiceType()).toBeNull();
  });
});
