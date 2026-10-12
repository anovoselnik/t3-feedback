import { randomUUID } from "node:crypto";

// Stands in for the Receiver behind the manual test page: it keeps each Feedback
// instead of dispatching it, and its Thread link points at a page that shows it.
export function createEchoReceiver({ machine, threadBaseUrl }) {
  const received = new Map();

  return {
    async health() {
      return { machine, t3Reachable: false };
    },

    async submit({ image, ...feedback }) {
      const threadId = randomUUID();
      const echoed = { ...feedback, image: image && { mimeType: image.mimeType, sizeBytes: image.bytes.length } };
      received.set(threadId, echoed);
      return { threadId, threadUrl: `${threadBaseUrl.replace(/\/+$/, "")}/${threadId}`, echo: echoed };
    },

    received(threadId) {
      return received.get(threadId);
    },
  };
}
