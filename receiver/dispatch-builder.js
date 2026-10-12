import { randomBytes, randomUUID } from "node:crypto";

const TITLE_MAX = 60;
const BRANCH_SLUG_MAX = 40;
export const IMAGE_EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export function firstLine(message) {
  return message.trim().split(/\r?\n/, 1)[0].trim();
}

export function threadTitle(message) {
  const line = firstLine(message);
  if (line.length <= TITLE_MAX) return `Feedback: ${line}`;
  const cut = line.slice(0, TITLE_MAX);
  const wordEnd = cut.lastIndexOf(" ");
  return `Feedback: ${(wordEnd > TITLE_MAX / 2 ? cut.slice(0, wordEnd) : cut.slice(0, TITLE_MAX - 1)).trimEnd()}…`;
}

export function branchName(message, suffix) {
  const slug =
    firstLine(message)
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, BRANCH_SLUG_MAX)
      .replace(/^-+|-+$/g, "") || "feedback";
  return `feedback/${slug}-${suffix}`;
}

export function messageText(feedback, stalenessNote) {
  const screenshot = feedback.image ? ", screenshot attached" : "";
  const preamble =
    `UI feedback from staging page \`${feedback.pageUrl}\` (viewport \`${feedback.viewport}\`)${screenshot}. ` +
    "The symptom is visual, but the cause may be anywhere: trace from the rendered page back through templates, " +
    "components, and backend code that produce it. Make the change the message asks for and verify it on a local " +
    "preview before finishing.";
  return [preamble, feedback.message.trim(), stalenessNote].filter(Boolean).join("\n\n");
}

function imageAttachment(image) {
  const base64 = image.bytes.toString("base64");
  return {
    type: "image",
    name: `screenshot.${IMAGE_EXTENSIONS[image.mimeType]}`,
    mimeType: image.mimeType,
    sizeBytes: image.bytes.length,
    dataUrl: `data:${image.mimeType};base64,${base64}`,
  };
}

export function buildDispatch({
  feedback,
  project,
  branch,
  fallbackModelSelection,
  uuid = randomUUID,
  branchSuffix = () => randomBytes(2).toString("hex"),
  now = new Date(),
}) {
  const createdAt = now.toISOString();
  const modelSelection = project.defaultModelSelection ?? fallbackModelSelection;
  return {
    type: "thread.turn.start",
    commandId: uuid(),
    threadId: uuid(),
    message: {
      messageId: uuid(),
      role: "user",
      text: messageText(feedback, branch.stalenessNote),
      attachments: feedback.image ? [imageAttachment(feedback.image)] : [],
    },
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    bootstrap: {
      createThread: {
        projectId: project.id,
        title: threadTitle(feedback.message),
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: branch.baseBranch,
        worktreePath: null,
        createdAt,
      },
      prepareWorktree: {
        projectCwd: project.workspaceRoot,
        baseBranch: branch.baseBranch,
        branch: branchName(feedback.message, branchSuffix()),
        startFromOrigin: branch.startFromOrigin,
        requireWorktree: true,
      },
      runSetupScript: true,
    },
    createdAt,
  };
}
