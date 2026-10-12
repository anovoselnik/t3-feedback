// The t3-feedback Widget: a "Send feedback" button that sends a Feedback to a Receiver.
// Classic script, no build step, no dependencies. Configured on its script tag:
//   data-project="owner/name"
//   data-machines='{"omarchy": "https://omarchy.example.ts.net:7777"}'
//   data-receiver-path="/prefix" (optional; where the Receiver is mounted under the base URL)
(() => {
  "use strict";

  const HOST_TAG = "t3-feedback-widget";
  const HOST_ID = "t3-feedback-widget";
  const PROBE_TIMEOUT_MS = 2500;
  const TAILSCALE_HINT = "Check that this device is connected to Tailscale.";

  // Turbo Drive runs the scripts of every new <body> again; the host from the first run is carried over.
  if (window.t3FeedbackWidget) return;
  window.t3FeedbackWidget = true;

  const config = readConfig(document.currentScript);
  if (!config) return;

  probe(config.receiverUrl).then((online) => {
    if (!online) return;
    if (document.body) mount(config);
    else document.addEventListener("DOMContentLoaded", () => mount(config), { once: true });
  });

  function readConfig(script) {
    const { project, machines, receiverPath = "" } = script?.dataset ?? {};
    let machineMap;
    try {
      machineMap = JSON.parse(machines);
    } catch {
      machineMap = null;
    }
    const [machine, baseUrl] = Object.entries(machineMap ?? {})[0] ?? [];
    if (!project || typeof baseUrl !== "string") {
      console.warn("t3-feedback: the script tag needs data-project and a JSON data-machines map");
      return null;
    }
    const path = `/${receiverPath}`.replace(/\/+/g, "/").replace(/\/$/, "");
    return { project, machine, receiverUrl: baseUrl.replace(/\/+$/, "") + path };
  }

  // The Receiver's hostname resolves off the tailnet too, where requests hang instead of failing,
  // so the timeout is what keeps the button hidden for outsiders.
  async function probe(receiverUrl) {
    try {
      const response = await fetch(`${receiverUrl}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      return response.ok;
    } catch {
      return false;
    }
  }

  // A multipart body and no custom headers keep this a simple request, so there is no CORS preflight.
  async function submit({ project, machine, receiverUrl }, message) {
    const body = new FormData();
    body.append("project", project);
    body.append("machine", machine);
    body.append("message", message);
    body.append("pageUrl", location.href);
    body.append("viewport", `${window.innerWidth}x${window.innerHeight}`);
    body.append("userAgent", navigator.userAgent);

    let response;
    try {
      response = await fetch(`${receiverUrl}/feedback`, { method: "POST", body });
    } catch {
      throw new Error(`Could not reach the Receiver on ${machine}.`);
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `The Receiver on ${machine} answered ${response.status}.`);
    const threadUrl = httpUrl(result.threadUrl);
    if (!threadUrl) throw new Error(`The Receiver on ${machine} did not return a Thread link.`);
    return threadUrl;
  }

  function httpUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
    } catch {
      return null;
    }
  }

  function createHost() {
    const host = document.createElement(HOST_TAG);
    host.id = HOST_ID;
    host.setAttribute("data-turbo-permanent", "");
    return host;
  }

  function mount(config) {
    const host = createHost();
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLE}</style>
      <button class="launcher" type="button">Send feedback</button>
      <form class="panel" hidden>
        <div class="header">
          <span class="title">Send feedback</span>
          <button class="close" type="button" aria-label="Close">×</button>
        </div>
        <textarea rows="5" aria-label="Feedback message" placeholder="What should change on this page?"></textarea>
        <p class="status" role="status"></p>
        <div class="footer">
          <span class="meta"></span>
          <button class="send" type="submit">Send</button>
        </div>
      </form>`;

    const launcher = root.querySelector(".launcher");
    const panel = root.querySelector(".panel");
    const textarea = root.querySelector("textarea");
    const status = root.querySelector(".status");
    const sendButton = root.querySelector(".send");
    const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘+Enter" : "Ctrl+Enter";
    root.querySelector(".meta").textContent = `To ${config.machine} · ${shortcut}`;
    let sending = false;

    const open = () => {
      launcher.hidden = true;
      panel.hidden = false;
      textarea.focus();
    };
    const close = () => {
      panel.hidden = true;
      launcher.hidden = false;
      launcher.focus();
    };

    const showSent = (threadUrl) => {
      const link = document.createElement("a");
      link.href = threadUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Open thread";
      status.className = "status sent";
      status.replaceChildren("Sent. ", link);
    };
    const showError = (message) => {
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = TAILSCALE_HINT;
      status.className = "status error";
      status.replaceChildren(message, " ", hint);
    };

    const send = async () => {
      const message = textarea.value.trim();
      if (sending) return;
      if (!message) {
        textarea.focus();
        return;
      }
      sending = true;
      // Disabling the focused Send button drops focus out of the Widget, and Escape with it.
      const refocus = root.activeElement === sendButton;
      sendButton.disabled = true;
      sendButton.textContent = "Sending…";
      status.className = "status";
      status.replaceChildren();
      try {
        showSent(await submit(config, message));
        textarea.value = "";
      } catch (error) {
        showError(error.message);
      } finally {
        sending = false;
        sendButton.disabled = false;
        sendButton.textContent = "Send";
        if (refocus && document.activeElement === document.body) sendButton.focus();
      }
    };

    launcher.addEventListener("click", open);
    root.querySelector(".close").addEventListener("click", close);
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      send();
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        send();
      }
    });
    // Keep the page's keyboard shortcuts from firing while typing in the Widget.
    for (const type of ["keydown", "keyup", "keypress"]) {
      panel.addEventListener(type, (event) => event.stopPropagation());
    }

    // Turbo carries a permanent element over only when the new <body> has one with the same id,
    // and the server-rendered page never does, so give it a placeholder to swap.
    document.addEventListener("turbo:before-render", (event) => {
      const { newBody } = event.detail;
      if (!newBody.querySelector(`#${HOST_ID}`)) newBody.append(createHost());
    });

    document.body.append(host);
  }

  // Pixel units only: rem would follow the host page's root font size.
  const STYLE = `
    :host {
      all: initial !important;
      display: block !important;
      position: fixed !important;
      right: 16px !important;
      bottom: 16px !important;
      z-index: 2147483647 !important;
      font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif !important;
      color: #18181b !important;
    }
    *, *::before, *::after { box-sizing: border-box; }
    [hidden] { display: none !important; }
    button, textarea { font: inherit; color: inherit; margin: 0; }
    button { cursor: pointer; }
    .launcher {
      padding: 10px 16px;
      border: none;
      border-radius: 999px;
      background: #18181b;
      color: #fafafa;
      font-weight: 600;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    }
    .launcher:hover { background: #3f3f46; }
    .panel {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 320px;
      max-width: calc(100vw - 32px);
      padding: 12px;
      border: 1px solid #e4e4e7;
      border-radius: 12px;
      background: #ffffff;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
    }
    .header, .footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .title { font-weight: 600; }
    .close {
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: 6px;
      background: transparent;
      font-size: 18px;
      line-height: 1;
    }
    .close:hover { background: #f4f4f5; }
    textarea {
      display: block;
      width: 100%;
      min-height: 96px;
      padding: 8px;
      border: 1px solid #d4d4d8;
      border-radius: 8px;
      background: #ffffff;
      resize: vertical;
    }
    textarea:focus, button:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
    .status { margin: 0; font-size: 13px; }
    .status:empty { display: none; }
    .status a { color: #2563eb; font-weight: 600; }
    .error { color: #b91c1c; }
    .hint { display: block; color: #52525b; }
    .meta { color: #71717a; font-size: 12px; }
    .send {
      padding: 8px 14px;
      border: none;
      border-radius: 8px;
      background: #2563eb;
      color: #ffffff;
      font-weight: 600;
    }
    .send:hover { background: #1d4ed8; }
    .send:disabled { background: #93c5fd; cursor: default; }
  `;
})();
