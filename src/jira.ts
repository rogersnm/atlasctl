import { markdownToAdf } from "marklassian";
import { createApiClient } from "./api-client";
import type {
  CreateJiraIssueInput,
  CreateJiraIssueResult,
  RequiredConfig,
} from "./types";

export function buildIssueFields(input: CreateJiraIssueInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    project: { key: input.projectKey },
    summary: input.summary,
    issuetype: { name: input.issueType },
  };

  if (input.descriptionMarkdown) {
    fields.description = markdownToAdf(input.descriptionMarkdown);
  }

  if (input.priority) {
    fields.priority = { name: input.priority };
  }

  if (input.labels?.length) {
    fields.labels = input.labels;
  }

  if (input.assignee) {
    fields.assignee = { accountId: input.assignee };
  }

  return fields;
}

export async function createJiraIssue(
  config: RequiredConfig,
  input: CreateJiraIssueInput,
): Promise<CreateJiraIssueResult> {
  const client = createApiClient(config, "");
  const fields = buildIssueFields(input);
  const result = await client.apiPost("/rest/api/3/issue", { fields });

  return {
    key: result.key,
    id: result.id,
    url: `https://${config.site}/browse/${result.key}`,
    summary: input.summary,
  };
}
