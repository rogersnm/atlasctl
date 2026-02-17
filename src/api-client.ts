import type { RequiredConfig } from "./types";

export interface ApiClient {
  baseUrl: string;
  apiGet: (pathOrUrl: string) => Promise<any>;
  apiPost: (path: string, body: unknown) => Promise<any>;
  fetchAllPages: (path: string) => Promise<any[]>;
}

function normalizePaginationLink(next: string): string {
  if (next.startsWith("http://") || next.startsWith("https://")) {
    return next;
  }

  if (next.startsWith("/wiki/")) {
    return next.slice("/wiki".length);
  }

  return next;
}

export function createApiClient(
  config: RequiredConfig,
  pathPrefix: string,
): ApiClient {
  const baseUrl = `https://${config.site}${pathPrefix}`;
  const auth = Buffer.from(`${config.email}:${config.apikey}`).toString(
    "base64",
  );

  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
  };

  function resolveUrl(pathOrUrl: string): string {
    if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
      return pathOrUrl;
    }
    return `${baseUrl}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
  }

  async function apiGet(pathOrUrl: string): Promise<any> {
    const url = resolveUrl(pathOrUrl);
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(
        `API error ${response.status} ${response.statusText}: GET ${url}`,
      );
    }

    return response.json();
  }

  async function apiPost(path: string, body: unknown): Promise<any> {
    const url = resolveUrl(path);
    const response = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `API error ${response.status} ${response.statusText}: POST ${url}${text ? ` - ${text}` : ""}`,
      );
    }

    return response.json();
  }

  async function fetchAllPages(path: string): Promise<any[]> {
    const results: any[] = [];
    let next: string | null = path;

    while (next) {
      const page = await apiGet(next);
      if (Array.isArray(page.results)) {
        results.push(...page.results);
      }

      next = page._links?.next
        ? normalizePaginationLink(page._links.next)
        : null;
    }

    return results;
  }

  return { baseUrl, apiGet, apiPost, fetchAllPages };
}
