const DISPATCH_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 2_000;

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
      return (await getJson("/api/orchestration/shell", { headers: auth() })).projects;
    },

    // Bootstrapped commands only work over the WebSocket RPC; the HTTP dispatch
    // endpoint skips bootstrap handling (see docs/PRD.md, Dispatch).
    async dispatch(command) {
      const { ticket } = await getJson("/api/auth/websocket-ticket", { method: "POST", headers: auth() });
      const socket = new WebSocket(`${base.replace(/^http/, "ws")}/ws?wsTicket=${encodeURIComponent(ticket)}`);
      try {
        return await rpcExit(socket, command);
      } finally {
        socket.close();
      }
    },
  };
}

function rpcExit(socket, command) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("T3 Code dispatch timed out")), DISPATCH_TIMEOUT_MS);
    const settle = (fn, value) => {
      clearTimeout(timer);
      fn(value);
    };
    socket.addEventListener("error", () => settle(reject, new Error("T3 Code WebSocket error")));
    socket.addEventListener("close", () => settle(reject, new Error("T3 Code closed the WebSocket before replying")));
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({ _tag: "Request", id: "1", tag: "orchestration.dispatchCommand", payload: command, headers: [] }),
      );
    });
    socket.addEventListener("message", (event) => {
      const frame = JSON.parse(String(event.data));
      const exit = (Array.isArray(frame) ? frame : [frame]).find(
        (message) => message._tag === "Exit" && String(message.requestId) === "1",
      );
      if (!exit) return;
      if (exit.exit._tag === "Success") settle(resolve, exit.exit.value);
      else settle(reject, new Error(`T3 Code rejected the dispatch: ${JSON.stringify(exit.exit.cause)}`));
    });
  });
}
