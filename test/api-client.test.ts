import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createApiClient } from "../src/api-client";
import type { RequiredConfig } from "../src/types";

const CONFIG: RequiredConfig = {
  site: "example.atlassian.net",
  email: "user@example.com",
  apikey: "test-token",
};

describe("createApiClient", () => {
  let originalFetch: typeof globalThis.fetch;
  let lastRequest: { url: string; init?: RequestInit } | null;

  function mockFetch(body: unknown, status = 200) {
    lastRequest = null;
    globalThis.fetch = async (input: any, init?: any) => {
      lastRequest = { url: String(input), init };
      return new Response(JSON.stringify(body), {
        status,
        statusText: status === 200 ? "OK" : "Bad Request",
        headers: { "Content-Type": "application/json" },
      });
    };
  }

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("builds baseUrl with path prefix", () => {
    const client = createApiClient(CONFIG, "/wiki");
    expect(client.baseUrl).toBe("https://example.atlassian.net/wiki");
  });

  it("builds baseUrl with empty prefix for Jira", () => {
    const client = createApiClient(CONFIG, "");
    expect(client.baseUrl).toBe("https://example.atlassian.net");
  });

  it("sends Basic auth header on GET", async () => {
    mockFetch({ ok: true });
    const client = createApiClient(CONFIG, "/wiki");
    await client.apiGet("/rest/api/test");

    const auth = lastRequest!.init?.headers as Record<string, string>;
    const expected = Buffer.from("user@example.com:test-token").toString(
      "base64",
    );
    expect(auth.Authorization).toBe(`Basic ${expected}`);
  });

  it("resolves relative paths against baseUrl", async () => {
    mockFetch({ ok: true });
    const client = createApiClient(CONFIG, "/wiki");
    await client.apiGet("/rest/api/content/123");

    expect(lastRequest!.url).toBe(
      "https://example.atlassian.net/wiki/rest/api/content/123",
    );
  });

  it("passes absolute URLs through unchanged", async () => {
    mockFetch({ ok: true });
    const client = createApiClient(CONFIG, "/wiki");
    await client.apiGet("https://other.host/path");

    expect(lastRequest!.url).toBe("https://other.host/path");
  });

  it("throws on non-ok GET response", async () => {
    mockFetch({ error: "not found" }, 404);
    const client = createApiClient(CONFIG, "/wiki");

    await expect(client.apiGet("/rest/api/missing")).rejects.toThrow(
      "API error 404",
    );
  });

  it("sends POST with JSON body and Content-Type header", async () => {
    mockFetch({ id: "1" });
    const client = createApiClient(CONFIG, "");
    await client.apiPost("/rest/api/3/issue", { fields: { summary: "test" } });

    expect(lastRequest!.init?.method).toBe("POST");
    const headers = lastRequest!.init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    const sentBody = JSON.parse(lastRequest!.init?.body as string);
    expect(sentBody.fields.summary).toBe("test");
  });

  it("throws on non-ok POST response with body text", async () => {
    lastRequest = null;
    globalThis.fetch = async (input: any, init?: any) => {
      lastRequest = { url: String(input), init };
      return new Response("field required", {
        status: 400,
        statusText: "Bad Request",
      });
    };
    const client = createApiClient(CONFIG, "");

    await expect(
      client.apiPost("/rest/api/3/issue", {}),
    ).rejects.toThrow("API error 400");
  });

  it("paginates through multiple pages with fetchAllPages", async () => {
    let callCount = 0;
    globalThis.fetch = async (input: any, init?: any) => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            results: [{ id: "1" }],
            _links: { next: "/rest/api/page2" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ results: [{ id: "2" }], _links: {} }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = createApiClient(CONFIG, "/wiki");
    const results = await client.fetchAllPages("/rest/api/page1");

    expect(results).toEqual([{ id: "1" }, { id: "2" }]);
    expect(callCount).toBe(2);
  });

  it("strips /wiki prefix from pagination links", async () => {
    const urls: string[] = [];
    let callCount = 0;
    globalThis.fetch = async (input: any) => {
      urls.push(String(input));
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            results: [{ id: "1" }],
            _links: { next: "/wiki/rest/api/page2" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ results: [{ id: "2" }], _links: {} }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = createApiClient(CONFIG, "/wiki");
    await client.fetchAllPages("/rest/api/page1");

    expect(urls[1]).toBe(
      "https://example.atlassian.net/wiki/rest/api/page2",
    );
  });
});
