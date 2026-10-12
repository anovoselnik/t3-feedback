import { DEFAULT_CONFIG_PATH, loadConfig, readToken } from "./config.js";
import { git, readOriginRemote } from "./git.js";
import { createHttpServer } from "./http-layer.js";
import { createReceiver } from "./receiver.js";
import { createT3Client } from "./t3-client.js";

const configPath = process.argv[2] ?? process.env.T3_FEEDBACK_CONFIG ?? DEFAULT_CONFIG_PATH;
const config = await loadConfig(configPath);
const t3 = createT3Client({ baseUrl: config.t3BaseUrl, token: await readToken(config.tokenPath) });

try {
  console.log(`T3 Code environment ${await t3.environmentId()}`);
} catch (error) {
  console.warn(`${error.message}; will retry on the first Feedback`);
}

const receiver = createReceiver({ config, t3, git, readRemote: readOriginRemote });
createHttpServer({ config, receiver }).listen(config.port, "127.0.0.1", () => {
  console.log(`Receiver for ${config.machine} listening on http://127.0.0.1:${config.port}`);
});
