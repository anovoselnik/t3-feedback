const DISPATCH_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 2_000;
// T3 Code refuses orchestration requests that don't name the protocol they speak.
const ORCHESTRATION_PROTOCOL = "2";

export function createT3Client({ baseUrl, token, fetch = globalThis.fetch, WebSocket = globalThis.WebSocket }) {
  const base = baseUrl.replace(/\/+$/, "");
  let environmentId;

  async function getJson(path, init = {}) {
    const response = await fetch(`${base}${path}`, init).catch(() => {
      throw new Error(`T3 Code at ${base} is unreachable`);
    });
    if (!response.ok) throw new Error(`T3 Code ${init.method ?? "GET"} ${path} returned ${response.status}`);
    return response.json();
  }

  const auth = () => ({ authorization: `Bearer ${token}` });

  return {
    async environmentId() {
      environmentId ??= (await getJson("/.well-known/t3/environment")).environmentId;
      return environmentId;
    },

    async reachable() {
      try {
        await getJson("/.well-known/t3/environment", { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
        return true;
      } catch {
        return false;
      }
    },

    // The shell snapshot lists only active projects and leaves out thread messages.
    async listProjects() {
      const headers = { ...auth(), "x-t3-orchestration-protocol": ORCHESTRATION_PROTOCOL };
      return (await getJson("/api/orchestration/shell", { headers })).projects;
    },

    // Launching a thread only works over the WebSocket RPC (see docs/PRD.md, Dispatch).
    // Images are stored first, under the launch's thread and message ids, and the
    // launch refers to them by the ids T3 Code hands back.
    async launchThread(launch, uploads = []) {
      const { ticket } = await getJson("/api/auth/websocket-ticket", { method: "POST", headers: auth() });
      const socket = new WebSocket(
        `${base.replace(/^http/, "ws")}/ws?wsTicket=${encodeURIComponent(ticket)}&orchestrationProtocol=${ORCHESTRATION_PROTOCOL}`,
      );
      try {
        const rpc = await connect(socket);
        let attachments = [];
        if (uploads.length > 0) {
          ({ attachments } = await rpc("assets.persistChatAttachments", {
            threadId: launch.threadId,
            messageId: launch.initialMessage.messageId,
            attachments: uploads,
          }));
        }
        return await rpc("orchestration.launchThread", {
          ...launch,
          initialMessage: { ...launch.initialMessage, attachments },
        });
      } finally {
        socket.close();
      }
    },
  };
}

function connect(socket) {
  const pending = new Map();
  let nextId = 1;
  const failAll = (error) => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };
  socket.addEventListener("error", () => failAll(new Error("T3 Code WebSocket error")));
  socket.addEventListener("close", () => failAll(new Error("T3 Code closed the WebSocket before replying")));
  socket.addEventListener("message", (event) => {
    const frame = JSON.parse(String(event.data));
    for (const message of Array.isArray(frame) ? frame : [frame]) {
      const request = message._tag === "Exit" && pending.get(String(message.requestId));
      if (!request) continue;
      pending.delete(String(message.requestId));
      if (message.exit._tag === "Success") request.resolve(message.exit.value);
      else request.reject(new Error(`T3 Code rejected ${request.tag}: ${JSON.stringify(message.exit.cause)}`));
    }
  });

  const rpc = (tag, payload) =>
    new Promise((resolve, reject) => {
      const id = String(nextId++);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`T3 Code ${tag} timed out`));
      }, DISPATCH_TIMEOUT_MS);
      const settle = (fn) => (value) => {
        clearTimeout(timer);
        fn(value);
      };
      pending.set(id, { tag, resolve: settle(resolve), reject: settle(reject) });
      socket.send(JSON.stringify({ _tag: "Request", id, tag, payload, headers: [] }));
    });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("T3 Code WebSocket did not open")), DISPATCH_TIMEOUT_MS);
    const settle = (fn, value) => {
      clearTimeout(timer);
      fn(value);
    };
    socket.addEventListener("open", () => settle(resolve, rpc));
    socket.addEventListener("error", () => settle(reject, new Error("T3 Code WebSocket error")));
    socket.addEventListener("close", () => settle(reject, new Error("T3 Code closed the WebSocket before replying")));
  });
}
