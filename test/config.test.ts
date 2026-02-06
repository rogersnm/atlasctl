import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  maskConfig,
  normalizeConfigValue,
  readConfig,
  requireFetchConfig,
  resolveConfigPath,
  setConfigValue,
} from "../src/config";

describe("config", () => {
  let homeDir = "";

  beforeEach(async () => {
    homeDir = await mkdtemp(path.join(tmpdir(), "atlasctl-test-"));
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
  });

  it("sets and normalizes site values", async () => {
    await setConfigValue("site", "https://Example.ATlassian.net/wiki", { homeDir });

    const config = await readConfig({ homeDir });
    expect(config.site).toBe("example.atlassian.net");
  });

  it("stores email and apikey and masks apikey", async () => {
    await setConfigValue("email", "user@example.com", { homeDir });
    await setConfigValue("apikey", "secret-token", { homeDir });

    const config = await readConfig({ homeDir });
    expect(config.email).toBe("user@example.com");
    expect(config.apikey).toBe("secret-token");

    const masked = maskConfig(config);
    expect(masked.apikey).toBe("***hidden***");
  });

  it("writes config as JSON object", async () => {
    await setConfigValue("site", "example.atlassian.net", { homeDir });
    const configPath = resolveConfigPath({ homeDir });
    const raw = await readFile(configPath, "utf8");
    expect(raw).toContain("\"site\"");
  });

  it("throws on invalid JSON config file", async () => {
    const configPath = resolveConfigPath({ homeDir });
    await writeFile(configPath, "{invalid json", "utf8");

    await expect(readConfig({ homeDir })).rejects.toThrow("Invalid config");
  });

  it("reports missing keys for fetch config", () => {
    expect(() => requireFetchConfig({ site: "example.atlassian.net" })).toThrow(
      "Missing required config values",
    );
  });

  it("normalizes each config value type", () => {
    expect(normalizeConfigValue("site", "https://Example.atlassian.net/wiki")).toBe(
      "example.atlassian.net",
    );
    expect(normalizeConfigValue("email", "user@example.com")).toBe("user@example.com");
    expect(normalizeConfigValue("apikey", "secret-token")).toBe("secret-token");
  });
});
