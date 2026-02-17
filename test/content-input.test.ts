import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveContent } from "../src/content-input";

describe("resolveContent", () => {
  let tmpDir = "";

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "atlasctl-content-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns inline content when provided", async () => {
    const result = await resolveContent("# Hello", undefined);
    expect(result).toBe("# Hello");
  });

  it("reads content from file", async () => {
    const filePath = path.join(tmpDir, "body.md");
    await writeFile(filePath, "file content here", "utf8");

    const result = await resolveContent(undefined, filePath);
    expect(result).toBe("file content here");
  });

  it("throws when both inline and file are provided", async () => {
    await expect(
      resolveContent("inline", "/some/file"),
    ).rejects.toThrow("Cannot specify both");
  });

  it("returns empty string when neither provided and stdin is TTY", async () => {
    const result = await resolveContent(undefined, undefined);
    expect(result).toBe("");
  });

  it("throws on missing file", async () => {
    await expect(
      resolveContent(undefined, path.join(tmpDir, "missing.md")),
    ).rejects.toThrow();
  });
});
