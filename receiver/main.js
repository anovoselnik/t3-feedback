import { DEFAULT_CONFIG_PATH, loadConfig, readToken } from "./config.js";
import { git, readOriginRemote } from "./git.js";
import { createHttpServer } from "./http-layer.js";
import { createReceiver, protocolMismatch } from "./receiver.js";
import { createT3Client, ORCHESTRATION_PROTOCOL } from "./t3-client.js";

const configPath = process.argv[2] ?? process.env.T3_FEEDBACK_CONFIG ?? DEFAULT_CONFIG_PATH;
const config = await loadConfig(configPath);
const t3 = createT3Client({ baseUrl: config.t3BaseUrl, token: await readToken(config.tokenPath) });

try {
  const { environmentId, orchestrationProtocolVersion } = await t3.environment();
  console.log(`T3 Code environment ${environmentId}, orchestration protocol ${orchestrationProtocolVersion}`);
  if (orchestrationProtocolVersion !== ORCHESTRATION_PROTOCOL) {
    console.warn(`${protocolMismatch(orchestrationProtocolVersion, config.machine)} Feedback fails until then.`);
  }
} catch (error) {
  console.warn(`${error.message}; will retry on the first Feedback`);
}

const receiver = createReceiver({ config, t3, git, readRemote: readOriginRemote });
createHttpServer({ config, receiver }).listen(config.port, "127.0.0.1", () => {
  console.log(`Receiver for ${config.machine} listening on http://127.0.0.1:${config.port}`);
});
