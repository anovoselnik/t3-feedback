import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { createHttpServer, originMatcher } from "../receiver/http-layer.js";
import { createReceiver } from "../receiver/receiver.js";

const config = {
  machine: "omarchy",
  tailscaleLogin: "dev@github",
  webUiBaseUrl: "https://omarchy.example.ts.net/",
  allowedOrigins: ["https://staging.example.com", "https://*.local"],
  fallbackModelSelection: { instanceId: "claudeAgent", model: "claude-opus-5-5", options: [{ id: "effort", value: "medium" }] },
};

const projects = [
  { id: "p-site", title: "site", workspaceRoot: "/work/site", defaultModelSelection: null },
  { id: "p-other", title: "other", workspaceRoot: "/work/other", defaultModelSelection: null },
];
const remotes = { "/work/site": "git@github.com:acme/site.git", "/work/other": "https://github.com/acme/other" };

let dispatched;
let t3Up;
const t3 = {
  async reachable() {
    return t3Up;
  },
  async environmentId() {
    return "env-1";
  },
  async listProjects() {
    return projects;
  },
  async dispatch(command) {
    dispatched.push(command);
    return { sequence: 1 };
  },
};
const git = async (args) => (args[0] === "symbolic-ref" ? "origin/main\n" : "");
const readRemote = async (root) => remotes[root];

let server;
let base;

before(async () => {
  server = createHttpServer({ config, receiver: createReceiver({ config, t3, git, readRemote }) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  dispatched = [];
  t3Up = true;
});

const identity = { "tailscale-user-login": "dev@github" };

function form(fields = {}, image) {
  const body = new FormData();
  const values = {
    project: "acme/site",
    machine: "omarchy",
    message: "Button is misaligned\nSee screenshot",
    pageUrl: "https://staging.example.com/cart",
    viewport: "1280x800",
    userAgent: "test-agent",
    ...fields,
  };
  for (const [key, value] of Object.entries(values)) body.append(key, value);
  if (image) body.append("image", image, "paste.png");
  return body;
}

function post(body, headers = identity) {
  return fetch(`${base}/feedback`, { method: "POST", headers, body });
}

test("answers preflight for an allowlisted origin", async () => {
  const response = await fetch(`${base}/feedback`, {
    method: "OPTIONS",
    headers: {
      origin: "https://shop.local",
      "access-control-request-method": "POST",
      "access-control-request-private-network": "true",
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://shop.local");
  assert.match(response.headers.get("access-control-allow-methods"), /POST/);
  assert.equal(response.headers.get("access-control-allow-private-network"), "true");
});

test("refuses preflight for an origin that is not allowlisted", async () => {
  const response = await fetch(`${base}/feedback`, {
    method: "OPTIONS",
    headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("rejects a request without a Tailscale identity", async () => {
  const response = await post(form(), {});
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Tailscale identity/);
  assert.equal(dispatched.length, 0);
});

test("rejects a request from another Tailscale identity", async () => {
  const response = await post(form(), { "tailscale-user-login": "someone@github" });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /someone@github is not allowed/);
  assert.equal(dispatched.length, 0);
});

test("rejects a request from an origin that is not allowlisted", async () => {
  const response = await post(form(), { ...identity, origin: "https://evil.example" });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /Origin https:\/\/evil.example is not allowed/);
  assert.equal(dispatched.length, 0);
});

test("rejects an image over 10 MB", async () => {
  const image = new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "image/png" });
  const response = await post(form({}, image), { ...identity, origin: "https://staging.example.com" });
  assert.equal(response.status, 413);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://staging.example.com");
  assert.match((await response.json()).error, /10 MB limit/);
  assert.equal(dispatched.length, 0);
});

test("rejects a body over the size limit before parsing it", async () => {
  const body = form({ message: "x".repeat(12 * 1024 * 1024) });
  const response = await post(body);
  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /Feedback is larger than 11 MB/);
});

test("rejects images in formats T3 Code cannot attach", async () => {
  const response = await post(form({}, new Blob(["<svg/>"], { type: "image/svg+xml" })));
  assert.equal(response.status, 415);
});

test("rejects a Feedback without a message or a valid slug", async () => {
  assert.equal((await post(form({ message: "  " }))).status, 400);
  assert.equal((await post(form({ project: "not a slug" }))).status, 400);
});

test("reports the Machine label and T3 Code reachability", async () => {
  let response = await fetch(`${base}/health`, { headers: { ...identity, origin: "https://staging.example.com" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://staging.example.com");
  assert.deepEqual(await response.json(), { machine: "omarchy", t3Reachable: true });

  t3Up = false;
  response = await fetch(`${base}/health`, { headers: identity });
  assert.deepEqual(await response.json(), { machine: "omarchy", t3Reachable: false });
});

test("opens a Thread for a text-only Feedback and returns its URL", async () => {
  const response = await post(form(), { ...identity, origin: "https://staging.example.com" });
  assert.equal(response.status, 200);
  const [command] = dispatched;
  assert.deepEqual(await response.json(), {
    threadId: command.threadId,
    threadUrl: `https://omarchy.example.ts.net/env-1/${command.threadId}`,
    appUrl: `t3code://threads/env-1/${command.threadId}`,
  });
  assert.equal(command.bootstrap.createThread.projectId, "p-site");
  assert.equal(command.bootstrap.createThread.title, "Feedback: Button is misaligned");
  assert.equal(command.runtimeMode, "full-access");
  assert.match(command.bootstrap.prepareWorktree.branch, /^feedback\/button-is-misaligned-[0-9a-f]{4}$/);
  assert.deepEqual(command.message.attachments, []);
  assert.match(command.message.text, /^UI feedback from staging page `https:\/\/staging.example.com\/cart` \(viewport `1280x800`\)\. /);
});

test("attaches the uploaded image to the first message", async () => {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const response = await post(form({}, new Blob([bytes], { type: "image/png" })));
  assert.equal(response.status, 200);
  const [attachment] = dispatched[0].message.attachments;
  assert.deepEqual(attachment, {
    type: "image",
    name: "screenshot.png",
    mimeType: "image/png",
    sizeBytes: 4,
    dataUrl: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`,
  });
  assert.match(dispatched[0].message.text, /, screenshot attached\./);
});

test("returns 404 naming the slug and the Machine when no Project matches", async () => {
  const response = await post(form({ project: "acme/missing" }));
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /acme\/missing on omarchy/);
  assert.equal(dispatched.length, 0);
});

test("matches origin patterns with wildcards", () => {
  const allowed = originMatcher(["https://*.local", "http://localhost:*", "https://staging.example.com"]);
  assert.equal(allowed("https://shop.local"), true);
  assert.equal(allowed("https://staging.example.com"), true);
  assert.equal(allowed("http://localhost:5173"), true);
  assert.equal(allowed("https://staging.example.com.evil.io"), false);
  assert.equal(allowed("https://shop.local.evil.io"), false);
  assert.equal(allowed("http://shop.local"), false);
});
