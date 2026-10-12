import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_CONFIG_PATH = join(homedir(), ".config", "t3-feedback", "config.json");

const DEFAULTS = {
  port: 7777,
  t3BaseUrl: "http://127.0.0.1:3773",
  fallbackModelSelection: {
    instanceId: "claudeAgent",
    model: "claude-opus-5-5",
    options: [{ id: "effort", value: "medium" }],
  },
};

const REQUIRED = ["machine", "tailscaleLogin", "tokenPath", "webUiBaseUrl", "allowedOrigins"];

export async function loadConfig(path = DEFAULT_CONFIG_PATH) {
  const config = { ...DEFAULTS, ...JSON.parse(await readFile(path, "utf8")) };
  const missing = REQUIRED.filter((key) => config[key] === undefined);
  if (missing.length > 0) throw new Error(`${path} is missing ${missing.join(", ")}`);
  if (!Array.isArray(config.allowedOrigins)) throw new Error(`${path}: allowedOrigins must be an array`);
  return config;
}

export async function readToken(tokenPath) {
  return (await readFile(tokenPath.replace(/^~(?=\/)/, homedir()), "utf8")).trim();
}
