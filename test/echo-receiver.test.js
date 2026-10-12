import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { createEchoReceiver } from "../receiver/echo-receiver.js";
import { createHttpServer } from "../receiver/http-layer.js";

const pageOrigin = "http://localhost:7779";
const receiver = createEchoReceiver({ machine: "echo", threadBaseUrl: `${pageOrigin}/thread/` });

let server;
let base;

before(async () => {
  server = createHttpServer({ config: { allowedOrigins: [pageOrigin] }, receiver, requireIdentity: false });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

function form(image) {
  const body = new FormData();
  body.append("project", "acme/site");
  body.append("machine", "echo");
  body.append("message", "Button is misaligned");
  body.append("pageUrl", `${pageOrigin}/`);
  body.append("viewport", "1280x800");
  body.append("userAgent", "test-agent");
  if (image) body.append("image", image, "paste.png");
  return body;
}

test("answers the health probe without a Tailscale identity", async () => {
  const response = await fetch(`${base}/health`, { headers: { origin: pageOrigin } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), pageOrigin);
  assert.deepEqual(await response.json(), { machine: "echo", t3Reachable: false });
});

test("echoes a Feedback and links to a page that shows it", async () => {
  const response = await fetch(`${base}/feedback`, { method: "POST", headers: { origin: pageOrigin }, body: form() });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), pageOrigin);
  const { threadId, threadUrl, echo } = await response.json();
  const expected = {
    project: "acme/site",
    machine: "echo",
    message: "Button is misaligned",
    pageUrl: `${pageOrigin}/`,
    viewport: "1280x800",
    userAgent: "test-agent",
    image: null,
  };
  assert.equal(threadUrl, `${pageOrigin}/thread/${threadId}`);
  assert.deepEqual(echo, expected);
  assert.deepEqual(receiver.received(threadId), expected);
});

test("echoes an image as its type and size", async () => {
  const image = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
  const response = await fetch(`${base}/feedback`, { method: "POST", body: form(image) });
  assert.deepEqual((await response.json()).echo.image, { mimeType: "image/png", sizeBytes: 4 });
});

test("still refuses origins that are not allowlisted", async () => {
  const response = await fetch(`${base}/feedback`, {
    method: "POST",
    headers: { origin: "https://evil.example" },
    body: form(),
  });
  assert.equal(response.status, 403);
});
