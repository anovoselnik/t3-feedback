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
      const echoed = {
        ...feedback,
        image: image && { mimeType: image.mimeType, sizeBytes: image.bytes.length, ...imageSize(image) },
      };
      received.set(threadId, echoed);
      return {
        threadId,
        threadUrl: `${threadBaseUrl.replace(/\/+$/, "")}/${threadId}`,
        appUrl: `t3code://threads/echo/${threadId}`,
        echo: echoed,
      };
    },

    received(threadId) {
      return received.get(threadId);
    },
  };
}

// Reads the dimensions from a PNG's IHDR chunk or a JPEG's frame header, so the test page
// shows whether the Widget downscaled an image. Other formats are not measured.
function imageSize({ mimeType, bytes }) {
  let size = null;
  try {
    if (mimeType === "image/png" && bytes.toString("latin1", 12, 16) === "IHDR") {
      size = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    } else if (mimeType === "image/jpeg") {
      size = jpegSize(bytes);
    }
  } catch {
    // A truncated header falls through to no dimensions.
  }
  return size ?? { width: null, height: null };
}

function jpegSize(bytes) {
  let offset = 2;
  while (offset + 9 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    // SOF0 to SOF15, except DHT (C4), JPG (C8), and DAC (CC), which share the range.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    }
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  return null;
}
