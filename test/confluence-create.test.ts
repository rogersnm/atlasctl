import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createConfluencePage,
  parseParentId,
  resolveSpaceId,
} from "../src/confluence";
import { createApiClient } from "../src/api-client";
import type { RequiredConfig } from "../src/types";

const CONFIG: RequiredConfig = {
  site: "example.atlassian.net",
  email: "user@example.com",
  apikey: "test-token",
};

describe("parseParentId", () => {
  it("accepts a numeric ID", () => {
    expect(parseParentId("12345")).toBe("12345");
  });

  it("extracts ID from a Confluence URL", () => {
    expect(
      parseParentId(
        "https://example.atlassian.net/wiki/spaces/ENG/pages/98765/Parent",
      ),
    ).toBe("98765");
  });

  it("throws on invalid input", () => {
    expect(() => parseParentId("not-valid")).toThrow("Invalid parent page");
  });
});

describe("resolveSpaceId", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns space ID from API response", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ results: [{ id: "1234567", key: "ENG" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const client = createApiClient(CONFIG, "/wiki");
    const id = await resolveSpaceId(client, "ENG");
    expect(id).toBe("1234567");
  });

  it("throws when space not found", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const client = createApiClient(CONFIG, "/wiki");
    await expect(resolveSpaceId(client, "NOPE")).rejects.toThrow(
      'space "NOPE" not found',
    );
  });
});

describe("createConfluencePage", () => {
  let originalFetch: typeof globalThis.fetch;
  const requests: { url: string; body?: any }[] = [];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    requests.length = 0;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function setupMockFetch() {
    globalThis.fetch = async (input: any, init?: any) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(init.body) : undefined;
      requests.push({ url, body });

      // Space lookup
      if (url.includes("/api/v2/spaces")) {
        return new Response(
          JSON.stringify({ results: [{ id: "1234567", key: "ENG" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Page create
      return new Response(
        JSON.stringify({
          id: "9999",
          title: body?.title ?? "Test",
          _links: { webui: "/spaces/ENG/pages/9999/Test" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
  }

  it("creates a page with correct v2 API payload", async () => {
    setupMockFetch();

    const result = await createConfluencePage(CONFIG, {
      spaceKey: "ENG",
      title: "My Page",
      bodyMarkdown: "# Hello\n\nWorld",
    });

    expect(result.id).toBe("9999");
    expect(result.title).toBe("My Page");
    expect(result.space).toBe("ENG");
    expect(result.url).toContain("/spaces/ENG/pages/9999");

    // Verify the POST payload
    const createReq = requests.find((r) => r.url.includes("/api/v2/pages"));
    expect(createReq).toBeDefined();
    expect(createReq!.body.spaceId).toBe("1234567");
    expect(createReq!.body.title).toBe("My Page");
    expect(createReq!.body.body.representation).toBe("markdown");
    expect(createReq!.body.body.value).toBe("# Hello\n\nWorld");
  });

  it("includes parentId when provided", async () => {
    setupMockFetch();

    await createConfluencePage(CONFIG, {
      spaceKey: "ENG",
      title: "Child Page",
      parentId: "55555",
      bodyMarkdown: "child content",
    });

    const createReq = requests.find((r) => r.url.includes("/api/v2/pages"));
    expect(createReq!.body.parentId).toBe("55555");
  });

  it("omits parentId when not provided", async () => {
    setupMockFetch();

    await createConfluencePage(CONFIG, {
      spaceKey: "ENG",
      title: "Top Page",
      bodyMarkdown: "",
    });

    const createReq = requests.find((r) => r.url.includes("/api/v2/pages"));
    expect(createReq!.body.parentId).toBeUndefined();
  });

  it("resolves space key first then creates page", async () => {
    setupMockFetch();

    await createConfluencePage(CONFIG, {
      spaceKey: "ENG",
      title: "Page",
      bodyMarkdown: "content",
    });

    expect(requests.length).toBe(2);
    expect(requests[0].url).toContain("/api/v2/spaces");
    expect(requests[1].url).toContain("/api/v2/pages");
  });
});
