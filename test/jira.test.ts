import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { buildIssueFields, createJiraIssue } from "../src/jira";
import type { RequiredConfig } from "../src/types";

const CONFIG: RequiredConfig = {
  site: "example.atlassian.net",
  email: "user@example.com",
  apikey: "test-token",
};

describe("buildIssueFields", () => {
  it("builds minimal required fields", () => {
    const fields = buildIssueFields({
      projectKey: "PROJ",
      summary: "Fix the bug",
      issueType: "Task",
    });

    expect(fields.project).toEqual({ key: "PROJ" });
    expect(fields.summary).toBe("Fix the bug");
    expect(fields.issuetype).toEqual({ name: "Task" });
    expect(fields.description).toBeUndefined();
    expect(fields.priority).toBeUndefined();
    expect(fields.labels).toBeUndefined();
    expect(fields.assignee).toBeUndefined();
  });

  it("converts markdown description to ADF", () => {
    const fields = buildIssueFields({
      projectKey: "PROJ",
      summary: "Test",
      issueType: "Bug",
      descriptionMarkdown: "# Title\n\nSome **bold** text",
    });

    const adf = fields.description as any;
    expect(adf.version).toBe(1);
    expect(adf.type).toBe("doc");
    expect(Array.isArray(adf.content)).toBe(true);
    expect(adf.content.length).toBeGreaterThan(0);

    // First node should be a heading
    expect(adf.content[0].type).toBe("heading");
    expect(adf.content[0].content[0].text).toBe("Title");
  });

  it("includes optional fields when provided", () => {
    const fields = buildIssueFields({
      projectKey: "PROJ",
      summary: "Feature",
      issueType: "Story",
      priority: "High",
      labels: ["frontend", "urgent"],
      assignee: "abc123",
    });

    expect(fields.priority).toEqual({ name: "High" });
    expect(fields.labels).toEqual(["frontend", "urgent"]);
    expect(fields.assignee).toEqual({ accountId: "abc123" });
  });

  it("skips empty labels array", () => {
    const fields = buildIssueFields({
      projectKey: "PROJ",
      summary: "Test",
      issueType: "Task",
      labels: [],
    });

    expect(fields.labels).toBeUndefined();
  });
});

describe("createJiraIssue", () => {
  let originalFetch: typeof globalThis.fetch;
  let lastRequest: { url: string; body?: any } | null;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    lastRequest = null;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts to Jira v3 API and returns result", async () => {
    globalThis.fetch = async (input: any, init?: any) => {
      lastRequest = {
        url: String(input),
        body: init?.body ? JSON.parse(init.body) : undefined,
      };
      return new Response(
        JSON.stringify({ id: "10001", key: "PROJ-42", self: "..." }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await createJiraIssue(CONFIG, {
      projectKey: "PROJ",
      summary: "New issue",
      issueType: "Task",
      descriptionMarkdown: "Description here",
    });

    expect(result.key).toBe("PROJ-42");
    expect(result.id).toBe("10001");
    expect(result.url).toBe("https://example.atlassian.net/browse/PROJ-42");
    expect(result.summary).toBe("New issue");

    // Verify the POST
    expect(lastRequest!.url).toContain("/rest/api/3/issue");
    expect(lastRequest!.body.fields.project).toEqual({ key: "PROJ" });
    expect(lastRequest!.body.fields.summary).toBe("New issue");
    expect(lastRequest!.body.fields.issuetype).toEqual({ name: "Task" });
    expect(lastRequest!.body.fields.description.type).toBe("doc");
  });

  it("sends request to site without /wiki prefix", async () => {
    globalThis.fetch = async (input: any, init?: any) => {
      lastRequest = { url: String(input) };
      return new Response(
        JSON.stringify({ id: "1", key: "X-1" }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    };

    await createJiraIssue(CONFIG, {
      projectKey: "X",
      summary: "test",
      issueType: "Task",
    });

    expect(lastRequest!.url).toBe(
      "https://example.atlassian.net/rest/api/3/issue",
    );
    expect(lastRequest!.url).not.toContain("/wiki");
  });
});
