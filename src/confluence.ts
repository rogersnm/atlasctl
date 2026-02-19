import { markdownToAdf } from "marklassian";
import { createApiClient, type ApiClient } from "./api-client";
import type {
  Comment,
  CreatePageInput,
  CreatePageResult,
  PageExport,
  RequiredConfig,
} from "./types";

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
    throw new Error(
      "Could not extract a numeric page ID from the provided URL.",
    );
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

  if (
    parsed.hostFromUrl &&
    parsed.hostFromUrl !== configuredSite.toLowerCase()
  ) {
    throw new Error(
      `URL host mismatch: URL uses ${parsed.hostFromUrl} but config site is ${configuredSite}.`,
    );
  }

  return parsed.pageId;
}

/**
 * Extract a numeric page ID from a page ID string or Confluence URL.
 * Accepts raw numeric IDs or full URLs containing /pages/<id>.
 */
export function parseParentId(idOrUrl: string): string {
  const value = idOrUrl.trim();
  if (/^\d+$/.test(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/pages\/(\d+)(?:\/|$)/);
    if (match) {
      return match[1];
    }
  } catch {
    // not a URL, fall through
  }

  throw new Error(
    `Invalid parent page identifier "${value}". Provide a numeric page ID or a Confluence page URL.`,
  );
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

async function fetchReplies(
  client: ApiClient,
  commentId: string,
): Promise<Comment[]> {
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
  const client = createApiClient(config, "/wiki");

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
      labels: (page.metadata?.labels?.results ?? []).map(
        (label: any) => label.name,
      ),
      bodyHtml: page.body?.storage?.value ?? "",
    },
    comments,
    meta: {
      fetchedAt: new Date().toISOString(),
      totalComments: countComments(comments),
    },
  };
}

export async function resolveSpaceId(
  client: ApiClient,
  spaceKey: string,
): Promise<string> {
  const data = await client.apiGet(
    `/api/v2/spaces?keys=${encodeURIComponent(spaceKey)}&limit=1`,
  );

  if (!data.results?.length) {
    throw new Error(`Confluence space "${spaceKey}" not found.`);
  }

  return data.results[0].id;
}

export async function createConfluencePage(
  config: RequiredConfig,
  input: CreatePageInput,
): Promise<CreatePageResult> {
  const client = createApiClient(config, "/wiki");
  const spaceId = await resolveSpaceId(client, input.spaceKey);

  const body: Record<string, unknown> = {
    spaceId,
    title: input.title,
    body: {
      representation: "atlas_doc_format",
      value: JSON.stringify(markdownToAdf(input.bodyMarkdown)),
    },
  };

  if (input.parentId) {
    body.parentId = input.parentId;
  }

  const result = await client.apiPost("/api/v2/pages", body);

  return {
    id: result.id,
    title: result.title,
    space: input.spaceKey,
    url: `${client.baseUrl}${result._links?.webui ?? ""}`,
  };
}
