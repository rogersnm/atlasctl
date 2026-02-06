import type { Comment, PageExport, RequiredConfig } from "./types";

interface ApiClient {
  baseUrl: string;
  apiGet: (pathOrUrl: string) => Promise<any>;
  fetchAllPages: (path: string) => Promise<any[]>;
}

interface ParsedPageInput {
  pageId: string;
  hostFromUrl?: string;
}

export function parsePageInput(idOrUrl: string): ParsedPageInput {
  const value = idOrUrl.trim();
  if (/^\d+$/.test(value)) {
    return { pageId: value };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Invalid page identifier. Provide a numeric page ID or a full Confluence page URL.",
    );
  }

  const fromPath = url.pathname.match(/\/pages\/(\d+)(?:\/|$)/)?.[1];
  const fromQuery = url.searchParams.get("pageId") ?? undefined;
  const pageId = fromPath ?? fromQuery;

  if (!pageId || !/^\d+$/.test(pageId)) {
    throw new Error("Could not extract a numeric page ID from the provided URL.");
  }

  return {
    pageId,
    hostFromUrl: url.host.toLowerCase(),
  };
}

export function resolvePageIdForSite(
  idOrUrl: string,
  configuredSite: string,
): string {
  const parsed = parsePageInput(idOrUrl);

  if (parsed.hostFromUrl && parsed.hostFromUrl !== configuredSite.toLowerCase()) {
    throw new Error(
      `URL host mismatch: URL uses ${parsed.hostFromUrl} but config site is ${configuredSite}.`,
    );
  }

  return parsed.pageId;
}

function countComments(comments: Comment[]): number {
  return comments.reduce((total, comment) => {
    return total + 1 + countComments(comment.children);
  }, 0);
}

function parseComment(raw: any): Comment {
  const ext = raw.extensions ?? {};
  let inlineContext: Comment["inlineContext"];

  if (ext.inlineProperties) {
    inlineContext = {
      textSelection: ext.inlineProperties.originalSelection ?? "",
      markerRef: ext.inlineProperties.markerRef ?? "",
      resolved: ext.resolution?.status === "resolved",
    };
  }

  return {
    id: raw.id,
    title: raw.title ?? "",
    author:
      raw.version?.by?.displayName ??
      raw.history?.createdBy?.displayName ??
      "unknown",
    created: raw.version?.when ?? raw.history?.createdDate ?? "",
    updated: raw.version?.when ?? "",
    bodyHtml: raw.body?.storage?.value ?? raw.body?.view?.value ?? "",
    inlineContext,
    children: [],
  };
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

function createClient(config: RequiredConfig): ApiClient {
  const baseUrl = `https://${config.site}/wiki`;
  const auth = Buffer.from(`${config.email}:${config.apikey}`).toString("base64");

  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
  };

  async function apiGet(pathOrUrl: string): Promise<any> {
    const url =
      pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")
        ? pathOrUrl
        : `${baseUrl}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Confluence API error ${response.status} ${response.statusText}: GET ${url}`);
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

      next = page._links?.next ? normalizePaginationLink(page._links.next) : null;
    }

    return results;
  }

  return {
    baseUrl,
    apiGet,
    fetchAllPages,
  };
}

async function fetchReplies(client: ApiClient, commentId: string): Promise<Comment[]> {
  const rawReplies = await client.fetchAllPages(
    `/rest/api/content/${commentId}/child/comment?expand=body.storage,version,extensions.inlineProperties,extensions.resolution&limit=100`,
  );

  const replies: Comment[] = [];
  for (const raw of rawReplies) {
    const reply = parseComment(raw);
    reply.children = await fetchReplies(client, raw.id);
    replies.push(reply);
  }

  return replies;
}

export async function fetchConfluencePage(
  config: RequiredConfig,
  idOrUrl: string,
): Promise<PageExport> {
  const pageId = resolvePageIdForSite(idOrUrl, config.site);
  const client = createClient(config);

  const page = await client.apiGet(
    `/rest/api/content/${pageId}?expand=body.storage,version,history,space,metadata.labels`,
  );

  const rawComments = await client.fetchAllPages(
    `/rest/api/content/${pageId}/child/comment?expand=body.storage,version,extensions.inlineProperties,extensions.resolution&limit=100`,
  );

  const comments: Comment[] = [];
  for (const raw of rawComments) {
    const comment = parseComment(raw);
    comment.children = await fetchReplies(client, raw.id);
    comments.push(comment);
  }

  return {
    page: {
      id: page.id,
      title: page.title,
      space: page.space?.key ?? "",
      url: `${client.baseUrl}${page._links?.webui ?? ""}`,
      author: page.version?.by?.displayName ?? "unknown",
      created: page.history?.createdDate ?? page.version?.when ?? "",
      lastUpdated: page.version?.when ?? "",
      version: page.version?.number ?? 1,
      labels: (page.metadata?.labels?.results ?? []).map((label: any) => label.name),
      bodyHtml: page.body?.storage?.value ?? "",
    },
    comments,
    meta: {
      fetchedAt: new Date().toISOString(),
      totalComments: countComments(comments),
    },
  };
}
