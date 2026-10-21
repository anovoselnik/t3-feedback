import assert from "node:assert/strict";
import { test } from "node:test";

import { createT3Client } from "../receiver/t3-client.js";

function fakeFetch(routes) {
  const requests = [];
  const fetch = async (url, init = {}) => {
    requests.push({
      url,
      method: init.method ?? "GET",
      authorization: init.headers?.authorization,
      ...(init.headers?.["x-t3-orchestration-protocol"] && { protocol: init.headers["x-t3-orchestration-protocol"] }),
    });
    const route = routes[`${init.method ?? "GET"} ${new URL(url).pathname}`];
    if (!route) return new Response("not found", { status: 404 });
    return Response.json(route);
  };
  return { fetch, requests };
}

function fakeWebSocket(reply) {
  const sockets = [];
  class FakeWebSocket extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      this.sent = [];
      this.closed = false;
      sockets.push(this);
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    send(data) {
      this.sent.push(JSON.parse(data));
      for (const frame of reply(JSON.parse(data))) {
        queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(frame) })));
      }
    }
    close() {
      this.closed = true;
    }
  }
  return { WebSocket: FakeWebSocket, sockets };
}

const routes = {
  "POST /api/auth/websocket-ticket": { ticket: "tick et", expiresAt: "2026-10-12T10:00:00Z" },
  "GET /api/orchestration/shell": { projects: [{ id: "p1", workspaceRoot: "/work/site" }], threads: [] },
  "GET /.well-known/t3/environment": { environmentId: "env-1" },
};

const launch = { threadId: "t1", projectId: "p1", initialMessage: { messageId: "m1", text: "hi", attachments: [] } };
const upload = { type: "image", name: "screenshot.png", mimeType: "image/png", sizeBytes: 3, dataUrl: "data:image/png;base64,AQID" };
const stored = { type: "image", id: "t1-att", name: "screenshot.png", mimeType: "image/png", sizeBytes: 3 };

function replyWith(values) {
  return (request) => [
    { _tag: "Chunk", requestId: request.id, values: [] },
    { _tag: "Exit", requestId: request.id, exit: { _tag: "Success", value: values[request.tag] } },
  ];
}

test("launches a thread over a ticketed WebSocket that names the orchestration protocol", async () => {
  const { fetch, requests } = fakeFetch(routes);
  const { WebSocket, sockets } = fakeWebSocket(replyWith({ "orchestration.launchThread": { threadId: "t1" } }));
  const client = createT3Client({ baseUrl: "http://127.0.0.1:3773/", token: "secret", fetch, WebSocket });

  assert.deepEqual(await client.launchThread(launch), { threadId: "t1" });
  assert.deepEqual(requests[0], { url: "http://127.0.0.1:3773/api/auth/websocket-ticket", method: "POST", authorization: "Bearer secret" });
  assert.equal(sockets[0].url, "ws://127.0.0.1:3773/ws?wsTicket=tick%20et&orchestrationProtocol=2");
  assert.deepEqual(sockets[0].sent, [{ _tag: "Request", id: "1", tag: "orchestration.launchThread", payload: launch, headers: [] }]);
  assert.equal(sockets[0].closed, true);
});

test("stores images under the launch's ids and launches with the stored attachments", async () => {
  const { fetch } = fakeFetch(routes);
  const { WebSocket, sockets } = fakeWebSocket(
    replyWith({
      "assets.persistChatAttachments": { attachments: [stored] },
      "orchestration.launchThread": { threadId: "t1" },
    }),
  );
  const client = createT3Client({ baseUrl: "http://127.0.0.1:3773", token: "secret", fetch, WebSocket });

  await client.launchThread(launch, [upload]);
  assert.deepEqual(sockets[0].sent, [
    {
      _tag: "Request",
      id: "1",
      tag: "assets.persistChatAttachments",
      payload: { threadId: "t1", messageId: "m1", attachments: [upload] },
      headers: [],
    },
    {
      _tag: "Request",
      id: "2",
      tag: "orchestration.launchThread",
      payload: { ...launch, initialMessage: { ...launch.initialMessage, attachments: [stored] } },
      headers: [],
    },
  ]);
});

test("surfaces a launch failure with its cause", async () => {
  const { fetch } = fakeFetch(routes);
  const { WebSocket, sockets } = fakeWebSocket((request) => [
    { _tag: "Exit", requestId: request.id, exit: { _tag: "Failure", cause: [{ _tag: "Fail", error: { message: "Project not found" } }] } },
  ]);
  const client = createT3Client({ baseUrl: "http://127.0.0.1:3773", token: "secret", fetch, WebSocket });
  await assert.rejects(client.launchThread(launch), /T3 Code rejected orchestration.launchThread: .*Project not found/);
  assert.equal(sockets[0].closed, true);
});

test("lists projects from the shell snapshot with the token", async () => {
  const { fetch, requests } = fakeFetch(routes);
  const client = createT3Client({ baseUrl: "http://127.0.0.1:3773", token: "secret", fetch });
  assert.deepEqual(await client.listProjects(), [{ id: "p1", workspaceRoot: "/work/site" }]);
  assert.equal(requests[0].authorization, "Bearer secret");
  assert.equal(requests[0].protocol, "2");
});

test("reads and caches the environment id", async () => {
  const { fetch, requests } = fakeFetch(routes);
  const client = createT3Client({ baseUrl: "http://127.0.0.1:3773", token: "secret", fetch });
  assert.equal(await client.environmentId(), "env-1");
  assert.equal(await client.environmentId(), "env-1");
  assert.equal(requests.length, 1);
});

test("reports reachability", async () => {
  const up = createT3Client({ baseUrl: "http://t3", token: "t", fetch: fakeFetch(routes).fetch });
  const down = createT3Client({
    baseUrl: "http://t3",
    token: "t",
    fetch: async () => {
      throw new TypeError("fetch failed");
    },
  });
  assert.equal(await up.reachable(), true);
  assert.equal(await down.reachable(), false);
  await assert.rejects(down.listProjects(), /T3 Code at http:\/\/t3 is unreachable/);
});
