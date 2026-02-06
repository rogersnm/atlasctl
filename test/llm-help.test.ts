import { describe, expect, it } from "bun:test";
import { describe as mtpDescribe } from "@modeltoolsprotocol/sdk";
import { buildProgram, DESCRIBE_OPTIONS } from "../src/cli";

describe("--describe", () => {
  it("returns valid MTP schema", () => {
    const schema = mtpDescribe(buildProgram(), DESCRIBE_OPTIONS) as Record<string, unknown>;

    expect(schema.specVersion).toBe("2026-02-07");
    expect(schema.name).toBe("atlasctl");
    expect(schema.version).toBe("0.3.1");
    expect(typeof schema.description).toBe("string");
    expect(Array.isArray(schema.commands)).toBe(true);
  });

  it("includes all leaf commands", () => {
    const schema = mtpDescribe(buildProgram(), DESCRIBE_OPTIONS) as Record<string, unknown>;
    const commands = schema.commands as Array<{ name: string }>;
    const names = commands.map((c) => c.name);

    expect(names).toContain("config set");
    expect(names).toContain("config get");
    expect(names).toContain("config show");
    expect(names).toContain("confluence page get");
  });

  it("has examples for every command", () => {
    const schema = mtpDescribe(buildProgram(), DESCRIBE_OPTIONS) as Record<string, unknown>;
    const commands = schema.commands as Array<{
      name: string;
      examples?: unknown[];
    }>;

    for (const cmd of commands) {
      expect(cmd.examples?.length).toBeGreaterThan(0);
    }
  });

  it("includes stdout schema for confluence page get", () => {
    const schema = mtpDescribe(buildProgram(), DESCRIBE_OPTIONS) as Record<string, unknown>;
    const commands = schema.commands as Array<{
      name: string;
      stdout?: { contentType?: string; schema?: unknown };
    }>;
    const pageGet = commands.find((c) => c.name === "confluence page get");

    expect(pageGet?.stdout?.contentType).toBe("application/json");
    expect(pageGet?.stdout?.schema).toBeDefined();
  });

  it("auto-detects args from Commander", () => {
    const schema = mtpDescribe(buildProgram(), DESCRIBE_OPTIONS) as Record<string, unknown>;
    const commands = schema.commands as Array<{
      name: string;
      args?: Array<{ name: string; type: string }>;
    }>;
    const pageGet = commands.find((c) => c.name === "confluence page get");
    const argNames = pageGet?.args?.map((a) => a.name) ?? [];

    expect(argNames).toContain("id-or-url");
    expect(argNames).toContain("--output");
    expect(argNames).toContain("--pretty");
  });
});
