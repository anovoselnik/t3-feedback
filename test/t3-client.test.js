import assert from "node:assert/strict";
import { test } from "node:test";

import { createT3Client } from "../receiver/t3-client.js";

function fakeFetch(routes) {
  const requests = [];
  const fetch = async (url, init = {}) => {
    requests.push({ url, method: init.method ?? "GET", authorization: init.headers?.authorization });
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

test("dispatches one command over a ticketed WebSocket and returns the exit value", async () => {
  const { fetch, requests } = fakeFetch(routes);
  const { WebSocket, sockets } = fakeWebSocket((request) => [
    { _tag: "Chunk", requestId: "1", values: [] },
    { _tag: "Exit", requestId: request.id, exit: { _tag: "Success", value: { sequence: 42 } } },
  ]);
  const client = createT3Client({ baseUrl: "http://127.0.0.1:3773/", token: "secret", fetch, WebSocket });

  assert.deepEqual(await client.dispatch({ type: "thread.turn.start" }), { sequence: 42 });
  assert.deepEqual(requests[0], { url: "http://127.0.0.1:3773/api/auth/websocket-ticket", method: "POST", authorization: "Bearer secret" });
  assert.equal(sockets[0].url, "ws://127.0.0.1:3773/ws?wsTicket=tick%20et");
  assert.deepEqual(sockets[0].sent, [
    { _tag: "Request", id: "1", tag: "orchestration.dispatchCommand", payload: { type: "thread.turn.start" }, headers: [] },
  ]);
  assert.equal(sockets[0].closed, true);
});

test("surfaces a dispatch failure with its cause", async () => {
  const { fetch } = fakeFetch(routes);
  const { WebSocket, sockets } = fakeWebSocket(() => [
    { _tag: "Exit", requestId: "1", exit: { _tag: "Failure", cause: [{ _tag: "Fail", error: { message: "Project not found" } }] } },
  ]);
  const client = createT3Client({ baseUrl: "http://127.0.0.1:3773", token: "secret", fetch, WebSocket });
  await assert.rejects(client.dispatch({}), /T3 Code rejected the dispatch: .*Project not found/);
  assert.equal(sockets[0].closed, true);
});

test("lists projects from the shell snapshot with the token", async () => {
  const { fetch, requests } = fakeFetch(routes);
  const client = createT3Client({ baseUrl: "http://127.0.0.1:3773", token: "secret", fetch });
  assert.deepEqual(await client.listProjects(), [{ id: "p1", workspaceRoot: "/work/site" }]);
  assert.equal(requests[0].authorization, "Bearer secret");
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
