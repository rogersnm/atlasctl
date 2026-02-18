import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { Command, InvalidArgumentError } from "commander";
import {
  CONFIG_KEYS,
  type ConfigKey,
  maskConfig,
  normalizeConfigValue,
  readConfig,
  requireFetchConfig,
  setConfigValue,
  writeConfig,
} from "./config";
import { resolveContent } from "./content-input";
import {
  createConfluencePage,
  fetchConfluencePage,
  parseParentId,
} from "./confluence";
import { createJiraIssue } from "./jira";
import { withDescribe, type DescribeOptions } from "@modeltoolsprotocol/sdk";

const VERSION = "0.4.2";

function parseConfigKey(value: string): ConfigKey {
  if (!CONFIG_KEYS.includes(value as ConfigKey)) {
    throw new InvalidArgumentError(
      `Invalid config key \"${value}\". Use one of: ${CONFIG_KEYS.join(", ")}`,
    );
  }

  return value as ConfigKey;
}

async function handleConfigSet(key: ConfigKey, value: string): Promise<void> {
  const configPath = await setConfigValue(key, value);
  console.log(`Saved ${key} in ${configPath}`);
}

function configPromptLabel(key: ConfigKey): string {
  if (key === "site") return "Atlassian site (for example: your-domain.atlassian.net)";
  if (key === "email") return "Atlassian account email";
  return "Atlassian API key";
}

function displayCurrentConfigValue(key: ConfigKey, value?: string): string {
  if (!value) {
    return "not set";
  }

  return key === "apikey" ? "***hidden***" : value;
}

async function handleConfigSetGuided(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "Guided setup requires an interactive terminal. Use: atlasctl config set <site|email|apikey> <value>",
    );
  }

  const config = await readConfig();
  const updates: Partial<Record<ConfigKey, string>> = {};
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    for (const key of CONFIG_KEYS) {
      while (true) {
        const current = updates[key] ?? config[key];
        const promptText = `${configPromptLabel(key)} [${displayCurrentConfigValue(key, current)}]: `;
        const input = (await rl.question(promptText)).trim();
        const candidate = input || current;

        if (!candidate) {
          console.error(`${key} is required.`);
          continue;
        }

        try {
          updates[key] = normalizeConfigValue(key, candidate);
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(message);
        }
      }
    }
  } finally {
    rl.close();
  }

  const configPath = await writeConfig({
    ...config,
    ...updates,
  });
  console.log(`Saved site, email, apikey in ${configPath}`);
}

async function handleConfigGet(key: ConfigKey): Promise<void> {
  const config = await readConfig();
  const value = config[key];

  if (!value) {
    throw new Error(
      `Config key \"${key}\" is not set. Use: atlasctl config set ${key} <value>`,
    );
  }

  if (key === "apikey") {
    console.log("***hidden***");
    return;
  }

  console.log(value);
}

async function handleConfigShow(): Promise<void> {
  const config = await readConfig();
  console.log(JSON.stringify(maskConfig(config), null, 2));
}

async function handlePageFetch(
  idOrUrl: string,
  options: { output?: string; pretty?: boolean },
): Promise<void> {
  const config = requireFetchConfig(await readConfig());
  const payload = await fetchConfluencePage(config, idOrUrl);

  const pretty = options.pretty ?? false;
  const json = pretty
    ? `${JSON.stringify(payload, null, 2)}\n`
    : `${JSON.stringify(payload)}\n`;

  if (options.output) {
    await writeFile(options.output, json, "utf8");
    console.log(`Wrote ${payload.meta.totalComments} comments to ${options.output}`);
    return;
  }

  process.stdout.write(json);
}

async function handlePageCreate(options: {
  space: string;
  title: string;
  parent?: string;
  body?: string;
  bodyFile?: string;
  pretty?: boolean;
}): Promise<void> {
  const config = requireFetchConfig(await readConfig());
  const bodyMarkdown = await resolveContent(options.body, options.bodyFile);
  const parentId = options.parent ? parseParentId(options.parent) : undefined;

  const result = await createConfluencePage(config, {
    spaceKey: options.space,
    title: options.title,
    parentId,
    bodyMarkdown,
  });

  const json = options.pretty
    ? `${JSON.stringify(result, null, 2)}\n`
    : `${JSON.stringify(result)}\n`;
  process.stdout.write(json);
}

async function handleJiraIssueCreate(options: {
  project: string;
  summary: string;
  type: string;
  description?: string;
  descriptionFile?: string;
  priority?: string;
  labels?: string;
  assignee?: string;
  pretty?: boolean;
}): Promise<void> {
  const config = requireFetchConfig(await readConfig());
  const descriptionMarkdown = await resolveContent(
    options.description,
    options.descriptionFile,
  );
  const labels = options.labels
    ? options.labels.split(",").map((l) => l.trim()).filter(Boolean)
    : undefined;

  const result = await createJiraIssue(config, {
    projectKey: options.project,
    summary: options.summary,
    issueType: options.type,
    descriptionMarkdown: descriptionMarkdown || undefined,
    priority: options.priority,
    labels,
    assignee: options.assignee,
  });

  const json = options.pretty
    ? `${JSON.stringify(result, null, 2)}\n`
    : `${JSON.stringify(result)}\n`;
  process.stdout.write(json);
}

async function handleConfigSetCommand(key?: string, value?: string): Promise<void> {
  if (!key && !value) {
    await handleConfigSetGuided();
    return;
  }

  if (!key || !value) {
    throw new Error(
      "Invalid config set usage. Use either: atlasctl config set <site|email|apikey> <value> or run atlasctl config set for guided setup.",
    );
  }

  await handleConfigSet(parseConfigKey(key), value);
}

export const DESCRIBE_OPTIONS: DescribeOptions = {
  commands: {
    "config set": {
      examples: [
        { description: "Interactive guided setup", command: "atlasctl config set" },
        { description: "Set site", command: "atlasctl config set site your-domain.atlassian.net" },
        { description: "Set API key", command: "atlasctl config set apikey your-token" },
      ],
    },
    "config get": {
      stdout: {
        contentType: "text/plain",
        description: "The config value. apikey always prints ***hidden***.",
      },
      examples: [
        { description: "Read configured site", command: "atlasctl config get site", output: "your-domain.atlassian.net" },
      ],
    },
    "config show": {
      stdout: {
        contentType: "application/json",
        description: "All config keys with apikey masked",
      },
      examples: [
        { description: "Display current config", command: "atlasctl config show" },
      ],
    },
    "confluence page get": {
      argTypes: { output: "path" },
      stdout: {
        contentType: "application/json",
        description: "Page metadata, recursive comment tree, and fetch metadata",
        schema: {
          type: "object",
          required: ["page", "comments", "meta"],
          properties: {
            page: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                space: { type: "string" },
                url: { type: "string" },
                bodyHtml: { type: "string" },
              },
            },
            comments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  author: { type: "string" },
                  bodyHtml: { type: "string" },
                  inlineContext: { type: "object" },
                  children: { type: "array" },
                },
              },
            },
            meta: {
              type: "object",
              properties: {
                fetchedAt: { type: "string" },
                totalComments: { type: "integer" },
              },
            },
          },
        },
      },
      examples: [
        { description: "Fetch a page by ID", command: "atlasctl confluence page get 12345 --pretty" },
        { description: "Fetch by URL, save to file", command: "atlasctl confluence page get https://your-domain.atlassian.net/wiki/spaces/ENG/pages/12345 --output page.json" },
      ],
    },
    "confluence page create": {
      stdout: {
        contentType: "application/json",
        description: "Created page metadata: id, title, space, url",
        schema: {
          type: "object",
          required: ["id", "title", "space", "url"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            space: { type: "string" },
            url: { type: "string" },
          },
        },
      },
      examples: [
        { description: "Create a page in ENG space", command: "atlasctl confluence page create --space ENG --title 'My Page' --body '# Hello'" },
        { description: "Create from file with parent", command: "atlasctl confluence page create --space ENG --title 'Child Page' --parent 12345 --body-file content.md --pretty" },
      ],
    },
    "jira issue create": {
      stdout: {
        contentType: "application/json",
        description: "Created issue metadata: key, id, url, summary",
        schema: {
          type: "object",
          required: ["key", "id", "url", "summary"],
          properties: {
            key: { type: "string" },
            id: { type: "string" },
            url: { type: "string" },
            summary: { type: "string" },
          },
        },
      },
      examples: [
        { description: "Create a task", command: "atlasctl jira issue create --project PROJ --summary 'Fix login bug' --type Task" },
        { description: "Create with description and priority", command: "atlasctl jira issue create --project PROJ --summary 'Add dark mode' --type Story --description '# Requirements\n\nSupport dark theme' --priority High" },
        { description: "Create with labels and assignee", command: "atlasctl jira issue create --project PROJ --summary 'Update deps' --type Task --labels 'tech-debt,chore' --assignee 5b10ac8d82e05b22cc7d4ef5" },
      ],
    },
  },
};

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("atlasctl")
    .description("Atlassian CLI for Confluence and Jira")
    .version(VERSION)
    .showHelpAfterError();

  withDescribe(program, DESCRIBE_OPTIONS);

  const configCommand = program.command("config").description("Manage local CLI configuration");

  configCommand
    .command("set")
    .description("Set one config value, or run guided setup with no arguments")
    .argument("[key]", "config key: site, email, apikey")
    .argument("[value]", "config value")
    .action(async (key?: string, value?: string) => {
      await handleConfigSetCommand(key, value);
    });

  configCommand
    .command("get")
    .description("Get a config value")
    .argument("<key>", "config key", parseConfigKey)
    .action(async (key: ConfigKey) => {
      await handleConfigGet(key);
    });

  configCommand
    .command("show")
    .description("Show current config (API key is always redacted)")
    .action(async () => {
      await handleConfigShow();
    });

  const confluenceCommand = program.command("confluence").description("Confluence operations");
  const pageCommand = confluenceCommand.command("page").description("Confluence page operations");

  pageCommand
    .command("get")
    .description("Get a Confluence page and all comments")
    .argument("<id-or-url>", "numeric page ID or full Confluence page URL")
    .option("--output <file>", "write JSON result to file")
    .option("--pretty", "pretty-print JSON output")
    .action(async (idOrUrl: string, options: { output?: string; pretty?: boolean }) => {
      await handlePageFetch(idOrUrl, options);
    });

  pageCommand
    .command("create")
    .description("Create a Confluence page from markdown")
    .requiredOption("--space <key>", "space key, e.g. ENG")
    .requiredOption("--title <title>", "page title")
    .option("--parent <id-or-url>", "parent page ID or URL")
    .option("--body <markdown>", "page body as markdown")
    .option("--body-file <file>", "read page body from file")
    .option("--pretty", "pretty-print JSON output")
    .action(async (options) => {
      await handlePageCreate(options);
    });

  const jiraCommand = program.command("jira").description("Jira operations");
  const issueCommand = jiraCommand.command("issue").description("Jira issue operations");

  issueCommand
    .command("create")
    .description("Create a Jira issue with markdown description")
    .requiredOption("--project <key>", "project key, e.g. PROJ")
    .requiredOption("--summary <text>", "issue summary")
    .requiredOption("--type <name>", "issue type: Task, Bug, Story, etc.")
    .option("--description <markdown>", "description as markdown")
    .option("--description-file <file>", "read description from file")
    .option("--priority <name>", "priority: High, Medium, Low, etc.")
    .option("--labels <csv>", "comma-separated labels")
    .option("--assignee <id>", "assignee account ID")
    .option("--pretty", "pretty-print JSON output")
    .action(async (options) => {
      await handleJiraIssueCreate(options);
    });

  return program;
}

export async function run(argv = process.argv): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}

