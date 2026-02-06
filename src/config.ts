import { chmod, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { AtlasCtlConfig, RequiredConfig } from "./types";

export const CONFIG_FILENAME = ".atlasctl.json";
export const CONFIG_KEYS = ["site", "email", "apikey"] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

interface ConfigPathOptions {
  configPath?: string;
  homeDir?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveConfigPath(options: ConfigPathOptions = {}): string {
  if (options.configPath) {
    return options.configPath;
  }

  const home = options.homeDir ?? homedir();
  return path.join(home, CONFIG_FILENAME);
}

export function normalizeSite(input: string): string {
  const value = input.trim();
  if (!value) {
    throw new Error("Site cannot be empty");
  }

  try {
    const url = value.includes("://")
      ? new URL(value)
      : new URL(`https://${value}`);

    if (!url.hostname) {
      throw new Error();
    }

    return url.host.toLowerCase();
  } catch {
    throw new Error("Invalid site. Use a hostname like your-domain.atlassian.net");
  }
}

function normalizeEmail(input: string): string {
  const value = input.trim();
  const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
  if (!isEmail) {
    throw new Error("Invalid email address");
  }
  return value;
}

function normalizeApiKey(input: string): string {
  const value = input.trim();
  if (!value) {
    throw new Error("API key cannot be empty");
  }
  return value;
}

export function normalizeConfigValue(key: ConfigKey, rawValue: string): string {
  if (key === "site") {
    return normalizeSite(rawValue);
  }

  if (key === "email") {
    return normalizeEmail(rawValue);
  }

  return normalizeApiKey(rawValue);
}

function normalizeConfig(raw: unknown): AtlasCtlConfig {
  if (!isRecord(raw)) {
    throw new Error("Config must be a JSON object");
  }

  const config: AtlasCtlConfig = {};

  if (typeof raw.site === "string" && raw.site.trim()) {
    config.site = normalizeSite(raw.site);
  }

  if (typeof raw.email === "string" && raw.email.trim()) {
    config.email = normalizeEmail(raw.email);
  }

  if (typeof raw.apikey === "string" && raw.apikey.trim()) {
    config.apikey = normalizeApiKey(raw.apikey);
  }

  return config;
}

export async function readConfig(
  options: ConfigPathOptions = {},
): Promise<AtlasCtlConfig> {
  const configPath = resolveConfigPath(options);

  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT") {
      return {};
    }
    throw new Error(`Unable to read config at ${configPath}: ${fileError.message}`);
  }

  try {
    const parsed = JSON.parse(raw);
    return normalizeConfig(parsed);
  } catch (error) {
    throw new Error(
      `Invalid config at ${configPath}. Ensure it is valid JSON with site/email/apikey strings.`,
    );
  }
}

export async function writeConfig(
  config: AtlasCtlConfig,
  options: ConfigPathOptions = {},
): Promise<string> {
  const configPath = resolveConfigPath(options);
  const normalized = normalizeConfig(config);
  const content = `${JSON.stringify(normalized, null, 2)}\n`;

  await writeFile(configPath, content, { mode: 0o600 });

  try {
    await chmod(configPath, 0o600);
  } catch {
    // Best effort permission hardening.
  }

  return configPath;
}

export async function setConfigValue(
  key: ConfigKey,
  rawValue: string,
  options: ConfigPathOptions = {},
): Promise<string> {
  const config = await readConfig(options);
  config[key] = normalizeConfigValue(key, rawValue);

  return writeConfig(config, options);
}

export function maskConfig(config: AtlasCtlConfig): AtlasCtlConfig {
  if (!config.apikey) {
    return { ...config };
  }

  return {
    ...config,
    apikey: "***hidden***",
  };
}

export function requireFetchConfig(config: AtlasCtlConfig): RequiredConfig {
  const missing: ConfigKey[] = [];

  for (const key of CONFIG_KEYS) {
    if (!config[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required config values: ${missing.join(", ")}. Set each with: atlasctl config set <site|email|apikey> <value>`,
    );
  }

  return config as RequiredConfig;
}
