// Serves the manual test page and two echo Receivers for it: `npm run test-page`.
// The page and the Receivers listen on different ports so the Widget's requests are cross-origin, as on a Staging page.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

import { createEchoReceiver } from "../receiver/echo-receiver.js";
import { createHttpServer } from "../receiver/http-layer.js";

// Two Machines, so the chooser has something to choose between. The page also configures a third
// Machine, "nowhere", whose probe never gets an answer.
const MACHINES = [
  { machine: "echo", port: 7778 },
  { machine: "echo2", port: 7780 },
];
const PAGE_PORT = 7779;
const pageOrigins = [`http://localhost:${PAGE_PORT}`, `http://127.0.0.1:${PAGE_PORT}`];

const FILES = {
  "/": { path: "test-page/index.html", type: "text/html" },
  "/other.html": { path: "test-page/other.html", type: "text/html" },
  "/offline.html": { path: "test-page/offline.html", type: "text/html" },
  "/hostile.css": { path: "test-page/hostile.css", type: "text/css" },
  "/t3-feedback.js": { path: "widget/t3-feedback.js", type: "text/javascript" },
};
const root = new URL("../", import.meta.url);

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
  response.writeHead(200, { "content-type": file.type, "cache-control": "no-store" });
  response.end(await readFile(new URL(file.path, root)));
}).listen(PAGE_PORT, "127.0.0.1", () => {
  const receiverList = MACHINES.map(({ machine, port }) => `${machine} on http://127.0.0.1:${port}`).join(", ");
  console.log(`Test page on ${pageOrigins[0]}, echo Receivers: ${receiverList}`);
});
