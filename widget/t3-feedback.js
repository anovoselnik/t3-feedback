// The t3-feedback Widget: shows a "Send feedback" button and sends each Feedback to a Receiver.
// Classic script, no build step, no dependencies. Configured on its script tag:
//   data-project="owner/name"
//   data-machines='{"omarchy": "https://omarchy.example.ts.net:7777"}'
//   data-receiver-path="/prefix" (optional; where the Receiver is mounted under the base URL)
(() => {
  "use strict";

  // Tag name and id of the element the Widget mounts into.
  const HOST = "t3-feedback-widget";
  // Leaves room for the Receiver's own check on T3 Code, which can take up to 2 seconds.
  const PROBE_TIMEOUT_MS = 4000;
  // Longer than the Receiver's own dispatch timeout, so a slow Thread start is not reported as a failure.
  const SEND_TIMEOUT_MS = 150_000;
  const TAILSCALE_HINT = "Check that this device is connected to Tailscale.";
  // Larger images, and any that are not PNG or JPEG, are re-encoded as JPEG no larger than MAX_IMAGE_SIDE.
  const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
  const MAX_IMAGE_SIDE = 1920;
  const JPEG_QUALITY = 0.85;

  // Turbo Drive runs the scripts of every new <body> again; the host from the first run is carried over.
  if (window.t3FeedbackWidget) return;
  window.t3FeedbackWidget = true;

  const config = readConfig(document.currentScript);
  if (!config) return;

  let probing = false;
  let mounted = false;
  const mountIfOnline = async () => {
    if (probing || mounted) return;
    probing = true;
    const online = await probe(config.receiverUrl);
    probing = false;
    if (!online || mounted) return;
    mounted = true;
    if (document.body) mount(config);
    else document.addEventListener("DOMContentLoaded", () => mount(config), { once: true });
  };
  mountIfOnline();
  // A Machine that was offline, or a local-network prompt answered after the probe gave up,
  // gets another chance on the next Turbo visit.
  document.addEventListener("turbo:load", mountIfOnline);

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
    let online;
    try {
      online = (await fetch(`${receiverUrl}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })).ok;
    } catch {
      online = false;
    }
    if (!online) console.info(`t3-feedback: no answer from ${receiverUrl}/health; check Tailscale and the Receiver's allowedOrigins`);
    return online;
  }

  // Returns the first image on the clipboard; read synchronously, since the data is gone once the handler returns.
  function pastedImage(event) {
    const item = [...(event.clipboardData?.items ?? [])].find(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    return item?.getAsFile() ?? null;
  }

  // Shown without the Tailscale hint: the image, not the connection, is the problem.
  class ImageError extends Error {}

  async function normaliseImage(file) {
    if ((file.type === "image/png" || file.type === "image/jpeg") && file.size <= MAX_IMAGE_BYTES) return file;

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new ImageError("This image could not be read; try a PNG or JPEG.");
    }
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    // JPEG has no transparency; without a background transparent pixels turn black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new ImageError("This image could not be converted to JPEG.");
    return blob;
  }

  // A multipart body and no custom headers keep this a simple request, so there is no CORS preflight.
  async function submit({ project, machine, receiverUrl }, message, image) {
    const body = new FormData();
    body.append("project", project);
    body.append("machine", machine);
    body.append("message", message);
    body.append("pageUrl", location.href);
    body.append("viewport", `${window.innerWidth}x${window.innerHeight}`);
    body.append("userAgent", navigator.userAgent);
    if (image) body.append("image", image, image.type === "image/png" ? "screenshot.png" : "screenshot.jpg");

    let response;
    try {
      response = await fetch(`${receiverUrl}/feedback`, { method: "POST", body, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
    } catch (error) {
      if (error.name === "TimeoutError") {
        throw new Error(`The Receiver on ${machine} did not answer in time; the Thread may still have started.`);
      }
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
    const host = document.createElement(HOST);
    host.id = HOST;
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
        <textarea rows="5" aria-label="Feedback message" placeholder="What should change on this page? Paste a screenshot to attach it."></textarea>
        <div class="attachment">
          <span class="preview" hidden>
            <img class="thumbnail" alt="Attached image" />
            <button class="remove" type="button" aria-label="Remove image">×</button>
          </span>
          <button class="attach" type="button">Attach image</button>
          <input class="picker" type="file" accept="image/*" hidden />
        </div>
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
    const preview = root.querySelector(".preview");
    const thumbnail = root.querySelector(".thumbnail");
    const attachButton = root.querySelector(".attach");
    const picker = root.querySelector(".picker");
    const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘+Enter" : "Ctrl+Enter";
    root.querySelector(".meta").textContent = `To ${config.machine} · ${shortcut}`;
    let sending = false;
    // A promise of the normalised image, or null; a newer paste or pick replaces it.
    let image = null;
    let thumbnailUrl = null;

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
    const showError = (error) => {
      status.className = "status error";
      if (error instanceof ImageError) {
        status.replaceChildren(error.message);
        return;
      }
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = TAILSCALE_HINT;
      status.replaceChildren(error.message, " ", hint);
    };

    const showImage = (blob) => {
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
      thumbnailUrl = blob && URL.createObjectURL(blob);
      thumbnail.src = thumbnailUrl ?? "";
      preview.hidden = !blob;
      attachButton.textContent = blob ? "Replace image" : "Attach image";
    };
    const attach = (file) => {
      const pending = normaliseImage(file);
      image = pending;
      status.className = "status";
      status.replaceChildren();
      pending.then(
        (blob) => {
          if (image === pending) showImage(blob);
        },
        (error) => {
          if (image !== pending) return;
          image = null;
          showImage(null);
          showError(error);
        },
      );
    };
    const removeImage = () => {
      image = null;
      showImage(null);
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
      const attached = image;
      try {
        showSent(await submit(config, message, await attached));
        textarea.value = "";
        if (image === attached) removeImage();
      } catch (error) {
        showError(error);
      } finally {
        sending = false;
        sendButton.disabled = false;
        sendButton.textContent = "Send";
        if (refocus && document.activeElement === document.body) sendButton.focus();
      }
    };

    launcher.addEventListener("click", open);
    root.querySelector(".close").addEventListener("click", close);
    // Only an image paste is taken over; text pastes into the textarea as usual.
    panel.addEventListener("paste", (event) => {
      const file = pastedImage(event);
      if (!file) return;
      event.preventDefault();
      attach(file);
    });
    attachButton.addEventListener("click", () => picker.click());
    picker.addEventListener("change", () => {
      const [file] = picker.files;
      // Cleared so that picking the same file again still fires change.
      picker.value = "";
      if (file) attach(file);
    });
    root.querySelector(".remove").addEventListener("click", () => {
      removeImage();
      attachButton.focus();
    });
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      send();
    });
    panel.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
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
      if (!newBody.querySelector(`#${HOST}`)) newBody.append(createHost());
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
    .attachment { display: flex; align-items: center; gap: 8px; }
    .preview { position: relative; display: inline-block; }
    .thumbnail {
      display: block;
      max-width: 96px;
      max-height: 64px;
      border: 1px solid #d4d4d8;
      border-radius: 6px;
    }
    .remove {
      position: absolute;
      top: -8px;
      right: -8px;
      width: 20px;
      height: 20px;
      padding: 0;
      border: none;
      border-radius: 999px;
      background: #18181b;
      color: #fafafa;
      font-size: 14px;
      line-height: 1;
    }
    .attach {
      padding: 4px 10px;
      border: 1px solid #d4d4d8;
      border-radius: 8px;
      background: #ffffff;
      font-size: 13px;
    }
    .attach:hover { background: #f4f4f5; }
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
