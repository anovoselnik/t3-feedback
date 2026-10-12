import { createServer } from "node:http";

import { IMAGE_EXTENSIONS } from "./dispatch-builder.js";
import { ReceiverError } from "./errors.js";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 1024 * 1024;
const IDENTITY_HEADER = "tailscale-user-login";

export function originMatcher(patterns) {
  const expressions = patterns.map(
    (pattern) => new RegExp(`^${pattern.split("*").map(escapeRegExp).join("[^/]*")}$`, "i"),
  );
  return (origin) => expressions.some((expression) => expression.test(origin));
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// requireIdentity is off only for the echo Receiver behind the manual test page, which
// runs on loopback without Tailscale Serve and never dispatches.
export function createHttpServer({ config, receiver, requireIdentity = true }) {
  const originAllowed = originMatcher(config.allowedOrigins);

  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    const corsHeaders = origin && originAllowed(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
    const send = (status, body) => {
      response.writeHead(status, { "content-type": "application/json", ...corsHeaders });
      response.end(JSON.stringify(body));
    };

    try {
      if (request.method === "OPTIONS") {
        if (!origin || !originAllowed(origin)) throw new ReceiverError(403, `Origin ${origin ?? "(none)"} is not allowed`);
        response.writeHead(204, {
          ...corsHeaders,
          "access-control-allow-methods": "GET, POST, OPTIONS",
          ...(request.headers["access-control-request-headers"] && {
            "access-control-allow-headers": request.headers["access-control-request-headers"],
          }),
          "access-control-allow-private-network": "true",
          "access-control-max-age": "600",
        });
        response.end();
        return;
      }

      if (requireIdentity) {
        const identity = request.headers[IDENTITY_HEADER];
        if (!identity) throw new ReceiverError(401, "Missing Tailscale identity; reach this Receiver through Tailscale Serve");
        if (identity !== config.tailscaleLogin) throw new ReceiverError(403, `Tailscale identity ${identity} is not allowed`);
      }
      // Browsers always send Origin on cross-origin requests; its absence means a non-browser client such as curl.
      if (origin && !originAllowed(origin)) throw new ReceiverError(403, `Origin ${origin} is not allowed`);

      const { pathname } = new URL(request.url, "http://receiver");
      if (request.method === "GET" && pathname === "/health") {
        send(200, await receiver.health());
      } else if (request.method === "POST" && pathname === "/feedback") {
        send(200, await receiver.submit(await readFeedback(request)));
      } else {
        throw new ReceiverError(404, `No route for ${request.method} ${pathname}`);
      }
    } catch (error) {
      if (!error.status) console.error(error);
      send(error.status ?? 500, { error: error.message });
    }
  });
}

async function readFeedback(request) {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    throw new ReceiverError(415, "Expected a multipart/form-data body");
  }
  const body = await readBody(request);
  let form;
  try {
    form = await new Response(body, { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new ReceiverError(400, "Malformed multipart body");
  }

  const field = (name) => {
    const value = form.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const feedback = {
    project: field("project"),
    machine: field("machine"),
    message: field("message"),
    pageUrl: field("pageUrl") || "unknown",
    viewport: field("viewport") || "unknown",
    userAgent: field("userAgent"),
    image: await readImage(form.get("image")),
  };
  if (!/^[\w.-]+\/[\w.-]+$/.test(feedback.project)) throw new ReceiverError(400, "Field project must be a GitHub slug (owner/name)");
  if (!feedback.message) throw new ReceiverError(400, "Field message is empty");
  return feedback;
}

async function readImage(file) {
  if (!file || typeof file === "string" || file.size === 0) return null;
  if (file.size > MAX_IMAGE_BYTES) throw imageTooLarge();
  if (!Object.hasOwn(IMAGE_EXTENSIONS, file.type)) throw new ReceiverError(415, `Image type ${file.type || "(none)"} is not supported; use PNG, JPEG, WebP, or GIF`);
  return { mimeType: file.type, bytes: Buffer.from(await file.arrayBuffer()) };
}

function imageTooLarge() {
  return new ReceiverError(413, "Image is larger than the 10 MB limit");
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= MAX_BODY_BYTES) chunks.push(chunk);
  }
  if (size > MAX_BODY_BYTES) throw new ReceiverError(413, "Feedback is larger than 11 MB; images are limited to 10 MB");
  return Buffer.concat(chunks);
}
