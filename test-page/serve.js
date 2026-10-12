// Serves the manual test page and two echo Receivers for it: `npm run test-page`.
// The page and the Receivers listen on different ports so the Widget's requests are cross-origin, as on a Staging page.
// `npm run test-page -- --jsdelivr` loads the released Widget from jsDelivr instead of widget/.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { parseArgs } from "node:util";

import { createEchoReceiver } from "../receiver/echo-receiver.js";
import { createHttpServer } from "../receiver/http-layer.js";

// Two Machines, so the chooser has something to choose between. The page also configures a third
// Machine, "nowhere", whose probe never gets an answer.
const MACHINES = [
  { machine: "echo", port: 7778 },
  { machine: "echo2", port: 7780 },
];
const PAGE_PORT = 7779;
// The release that Staging pages embed. Bump it with the embed URLs in the README.
const WIDGET_RELEASE = "v0.1.0";
const LOCAL_WIDGET = "/t3-feedback.js";
const pageOrigins = [`http://localhost:${PAGE_PORT}`, `http://127.0.0.1:${PAGE_PORT}`];

const FILES = {
  "/": { path: "test-page/index.html", type: "text/html" },
  "/other.html": { path: "test-page/other.html", type: "text/html" },
  "/offline.html": { path: "test-page/offline.html", type: "text/html" },
  "/hostile.css": { path: "test-page/hostile.css", type: "text/css" },
  [LOCAL_WIDGET]: { path: "widget/t3-feedback.js", type: "text/javascript" },
};
const root = new URL("../", import.meta.url);

const { values: options } = parseArgs({ options: { jsdelivr: { type: "boolean", default: false } } });
const widgetUrl = options.jsdelivr
  ? `https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@${WIDGET_RELEASE}/widget/t3-feedback.js`
  : LOCAL_WIDGET;

const receivers = MACHINES.map(({ machine, port }) => {
  const receiver = createEchoReceiver({ machine, threadBaseUrl: `${pageOrigins[0]}/thread` });
  const loggingReceiver = {
    ...receiver,
    async submit(feedback) {
      const result = await receiver.submit(feedback);
      console.log(`Feedback on ${machine}`, JSON.stringify(result.echo, null, 2));
      return result;
    },
  };
  createHttpServer({ config: { allowedOrigins: pageOrigins }, receiver: loggingReceiver, requireIdentity: false }).listen(
    port,
    "127.0.0.1",
  );
  return receiver;
});

createServer(async (request, response) => {
  const { pathname } = new URL(request.url, "http://page");

  // The "nowhere" Machine points the Widget here, where the health probe never gets an answer.
  if (pathname.startsWith("/never/")) return;

  // An echo Receiver's "Thread": the Feedback it received. Thread ids are unique across both.
  const threadId = pathname.match(/^\/thread\/([\w-]+)$/)?.[1];
  if (threadId) {
    const feedback = receivers.map((receiver) => receiver.received(threadId)).find(Boolean);
    response.writeHead(feedback ? 200 : 404, { "content-type": "application/json" });
    response.end(JSON.stringify(feedback ?? { error: "No Feedback with that id" }, null, 2));
    return;
  }

  const file = FILES[pathname];
  if (!file) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found");
    return;
  }
  let body = await readFile(new URL(file.path, root));
  if (file.type === "text/html") body = body.toString().replaceAll(`src="${LOCAL_WIDGET}"`, `src="${widgetUrl}"`);
  response.writeHead(200, { "content-type": file.type, "cache-control": "no-store" });
  response.end(body);
}).listen(PAGE_PORT, "127.0.0.1", () => {
  const receiverList = MACHINES.map(({ machine, port }) => `${machine} on http://127.0.0.1:${port}`).join(", ");
  console.log(`Test page on ${pageOrigins[0]}, echo Receivers: ${receiverList}`);
  console.log(`Widget from ${widgetUrl}`);
});
