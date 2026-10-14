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
  const { threadId, threadUrl, appUrl, echo } = await response.json();
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
  assert.equal(appUrl, `t3code://threads/echo/${threadId}`);
  assert.deepEqual(echo, expected);
  assert.deepEqual(receiver.received(threadId), expected);
});

async function echoedImage(bytes, type) {
  const response = await fetch(`${base}/feedback`, { method: "POST", body: form(new Blob([bytes], { type })) });
  return (await response.json()).echo.image;
}

// The 8-byte signature and the IHDR chunk, which is all the echo reads.
function pngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]).copy(bytes);
  bytes.write("IHDR", 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

// SOI, an APP0 segment to skip over, then a baseline SOF0 frame header.
function jpegHeader(width, height) {
  const app0 = [0xff, 0xe0, 0, 4, 0, 0];
  const sof0 = [0xff, 0xc0, 0, 8, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3];
  return Buffer.from([0xff, 0xd8, ...app0, ...sof0]);
}

test("echoes a PNG as its type, size, and dimensions", async () => {
  assert.deepEqual(await echoedImage(pngHeader(800, 600), "image/png"), {
    mimeType: "image/png",
    sizeBytes: 24,
    width: 800,
    height: 600,
  });
});

test("echoes a JPEG as its type, size, and dimensions", async () => {
  assert.deepEqual(await echoedImage(jpegHeader(1920, 1080), "image/jpeg"), {
    mimeType: "image/jpeg",
    sizeBytes: 18,
    width: 1920,
    height: 1080,
  });
});

test("echoes an image it cannot measure without dimensions", async () => {
  assert.deepEqual(await echoedImage(new Uint8Array([1, 2, 3, 4]), "image/webp"), {
    mimeType: "image/webp",
    sizeBytes: 4,
    width: null,
    height: null,
  });
});

test("still refuses origins that are not allowlisted", async () => {
  const response = await fetch(`${base}/feedback`, {
    method: "POST",
    headers: { origin: "https://evil.example" },
    body: form(),
  });
  assert.equal(response.status, 403);
});
