import assert from "node:assert/strict";
import { test } from "node:test";

import { branchName, buildDispatch, threadTitle } from "../receiver/dispatch-builder.js";

const fallbackModelSelection = { instanceId: "claudeAgent", model: "claude-opus-5-5", options: [{ id: "effort", value: "medium" }] };
const project = { id: "project-1", workspaceRoot: "/work/site", defaultModelSelection: null };
const freshBranch = { baseBranch: "main", startFromOrigin: true, stalenessNote: null };
const png = { mimeType: "image/png", bytes: Buffer.from([1, 2, 3]) };

function feedback(overrides = {}) {
  return {
    project: "owner/site",
    machine: "omarchy",
    message: "Header overlaps the logo\nOnly on mobile.",
    pageUrl: "https://staging.example.com/about",
    viewport: "390x844",
    userAgent: "test",
    image: null,
    ...overrides,
  };
}

function build(overrides = {}) {
  let id = 0;
  return buildDispatch({
    feedback: feedback(),
    project,
    branch: freshBranch,
    fallbackModelSelection,
    uuid: () => `uuid-${++id}`,
    branchSuffix: () => "a1b2",
    now: new Date("2026-10-12T10:00:00.000Z"),
    ...overrides,
  });
}

const preamble = (screenshot) =>
  `UI feedback from staging page \`https://staging.example.com/about\` (viewport \`390x844\`)${screenshot}. ` +
  "The symptom is visual, but the cause may be anywhere: trace from the rendered page back through templates, " +
  "components, and backend code that produce it. Make the change the message asks for and verify it on a local " +
  "preview before finishing.";

test("builds the full thread.turn.start command for a Feedback with an image", () => {
  assert.deepEqual(build({ feedback: feedback({ image: png }) }), {
    type: "thread.turn.start",
    commandId: "uuid-1",
    threadId: "uuid-2",
    message: {
      messageId: "uuid-3",
      role: "user",
      text: `${preamble(", screenshot attached")}\n\nHeader overlaps the logo\nOnly on mobile.`,
      attachments: [
        { type: "image", name: "screenshot.png", mimeType: "image/png", sizeBytes: 3, dataUrl: "data:image/png;base64,AQID" },
      ],
    },
    modelSelection: fallbackModelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    bootstrap: {
      createThread: {
        projectId: "project-1",
        title: "Feedback: Header overlaps the logo",
        modelSelection: fallbackModelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: "main",
        worktreePath: null,
        createdAt: "2026-10-12T10:00:00.000Z",
      },
      prepareWorktree: {
        projectCwd: "/work/site",
        baseBranch: "main",
        branch: "feedback/header-overlaps-the-logo-a1b2",
        startFromOrigin: true,
        requireWorktree: true,
      },
      runSetupScript: true,
    },
    createdAt: "2026-10-12T10:00:00.000Z",
  });
});

test("omits the screenshot mention and attachment when there is no image", () => {
  const command = build();
  assert.equal(command.message.text, `${preamble("")}\n\nHeader overlaps the logo\nOnly on mobile.`);
  assert.deepEqual(command.message.attachments, []);
});

test("does not send a titleSeed, so T3 Code keeps the Feedback title", () => {
  assert.equal("titleSeed" in build(), false);
});

test("names JPEG attachments with a matching extension", () => {
  const command = build({ feedback: feedback({ image: { mimeType: "image/jpeg", bytes: Buffer.from([255]) } }) });
  assert.equal(command.message.attachments[0].name, "screenshot.jpg");
  assert.equal(command.message.attachments[0].dataUrl, "data:image/jpeg;base64,/w==");
});

test("appends the staleness note and starts from the local branch when the fetch failed", () => {
  const command = build({
    branch: { baseBranch: "develop", startFromOrigin: false, stalenessNote: "Note: the base may be stale." },
  });
  assert.ok(command.message.text.endsWith("Only on mobile.\n\nNote: the base may be stale."));
  assert.equal(command.bootstrap.prepareWorktree.startFromOrigin, false);
  assert.equal(command.bootstrap.prepareWorktree.baseBranch, "develop");
  assert.equal(command.bootstrap.createThread.branch, "develop");
});

test("uses the Project's default model when it has one", () => {
  const projectDefault = { instanceId: "codex", model: "gpt-5", options: [{ id: "reasoningEffort", value: "high" }] };
  const command = build({ project: { ...project, defaultModelSelection: projectDefault } });
  assert.deepEqual(command.modelSelection, projectDefault);
  assert.deepEqual(command.bootstrap.createThread.modelSelection, projectDefault);
});

test("falls back to the configured model when the Project has no default", () => {
  assert.deepEqual(build().modelSelection, fallbackModelSelection);
});

test("trims long first lines in the title to about 60 characters", () => {
  const line = "The pricing table on the plans page wraps its last column under the first on tablets";
  const title = threadTitle(`${line}\nmore detail`);
  assert.equal(title, "Feedback: The pricing table on the plans page wraps its last column…");
  assert.equal(
    threadTitle("x".repeat(80)),
    `Feedback: ${"x".repeat(59)}…`,
  );
  assert.equal(threadTitle("  Short line  \nsecond"), "Feedback: Short line");
});

test("slugs the first message line into the branch name", () => {
  assert.equal(branchName("Fix: the Ćevapi menu's “Order” button!\nmore", "0f3c"), "feedback/fix-the-cevapi-menu-s-order-button-0f3c");
  assert.equal(branchName("!!!", "0f3c"), "feedback/feedback-0f3c");
  assert.equal(
    branchName("A very long first line that goes on and on well beyond forty characters", "beef"),
    "feedback/a-very-long-first-line-that-goes-on-and-beef",
  );
});

test("always requires a fresh worktree and runs the setup script", () => {
  const { bootstrap } = build();
  assert.equal(bootstrap.prepareWorktree.requireWorktree, true);
  assert.equal(bootstrap.runSetupScript, true);
  assert.equal(bootstrap.createThread.worktreePath, null);
  assert.match(bootstrap.prepareWorktree.branch, /^feedback\//);
});
