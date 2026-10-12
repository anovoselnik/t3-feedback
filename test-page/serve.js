// Serves the manual test page and an echo Receiver for it: `npm run test-page`.
// The two listen on different ports so the Widget's requests are cross-origin, as on a Staging page.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

import { createEchoReceiver } from "../receiver/echo-receiver.js";
import { createHttpServer } from "../receiver/http-layer.js";

const RECEIVER_PORT = 7778;
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

const receiver = createEchoReceiver({ machine: "echo", threadBaseUrl: `${pageOrigins[0]}/thread` });
const loggingReceiver = {
  ...receiver,
  async submit(feedback) {
    const result = await receiver.submit(feedback);
    console.log("Feedback", JSON.stringify(result.echo, null, 2));
    return result;
  },
};
createHttpServer({ config: { allowedOrigins: pageOrigins }, receiver: loggingReceiver, requireIdentity: false }).listen(
  RECEIVER_PORT,
  "127.0.0.1",
);

createServer(async (request, response) => {
  const { pathname } = new URL(request.url, "http://page");

  // offline.html points the Widget here, where the health probe never gets an answer.
  if (pathname.startsWith("/never/")) return;

  // The echo Receiver's "Thread": the Feedback it received.
  const threadId = pathname.match(/^\/thread\/([\w-]+)$/)?.[1];
  if (threadId) {
    const feedback = receiver.received(threadId);
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
  console.log(`Test page on ${pageOrigins[0]}, echo Receiver on http://127.0.0.1:${RECEIVER_PORT}`);
});
