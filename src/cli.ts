import { writeFile } from "node:fs/promises";
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
import { fetchConfluencePage } from "./confluence";
import { withDescribe, type DescribeOptions } from "@modeltoolsprotocol/sdk";

const VERSION = "0.3.1";

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

  for (const key of CONFIG_KEYS) {
    while (true) {
      const current = updates[key] ?? config[key];
      const promptText = `${configPromptLabel(key)} [${displayCurrentConfigValue(key, current)}]: `;
      const input = prompt(promptText)?.trim() ?? "";
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
  },
};

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("atlasctl")
    .description("Atlassian CLI for Confluence page exports")
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

  return program;
}

export async function run(argv = process.argv): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}

