export interface AtlasCtlConfig {
  site?: string;
  email?: string;
  apikey?: string;
}

export interface RequiredConfig {
  site: string;
  email: string;
  apikey: string;
}

export interface Comment {
  id: string;
  title: string;
  author: string;
  created: string;
  updated: string;
  bodyHtml: string;
  inlineContext?: {
    textSelection: string;
    markerRef: string;
    resolved: boolean;
  };
  children: Comment[];
}

export interface PageExport {
  page: {
    id: string;
    title: string;
    space: string;
    url: string;
    author: string;
    created: string;
    lastUpdated: string;
    version: number;
    labels: string[];
    bodyHtml: string;
  };
  comments: Comment[];
  meta: {
    fetchedAt: string;
    totalComments: number;
  };
}

export interface CreatePageInput {
  spaceKey: string;
  title: string;
  parentId?: string;
  bodyMarkdown: string;
}

export interface CreatePageResult {
  id: string;
  title: string;
  space: string;
  url: string;
}

export interface CreateJiraIssueInput {
  projectKey: string;
  summary: string;
  issueType: string;
  descriptionMarkdown?: string;
  priority?: string;
  labels?: string[];
  assignee?: string;
}

export interface CreateJiraIssueResult {
  key: string;
  id: string;
  url: string;
  summary: string;
}
