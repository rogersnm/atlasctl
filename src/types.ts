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
