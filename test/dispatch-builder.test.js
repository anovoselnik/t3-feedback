import assert from "node:assert/strict";
import { test } from "node:test";

import { branchName, buildLaunch, threadTitle } from "../receiver/dispatch-builder.js";

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
  return buildLaunch({
    feedback: feedback(),
    project,
    branch: freshBranch,
    fallbackModelSelection,
    uuid: () => `uuid-${++id}`,
    branchSuffix: () => "a1b2",
    ...overrides,
  });
}

const preamble = (screenshot) =>
  `UI feedback from staging page \`https://staging.example.com/about\` (viewport \`390x844\`)${screenshot}. ` +
  "The symptom is visual, but the cause may be anywhere: trace from the rendered page back through templates, " +
  "components, and backend code that produce it. Make the change the message asks for and verify it on a local " +
  "preview before finishing.";

test("builds the full launch for a Feedback with an image", () => {
  assert.deepEqual(build({ feedback: feedback({ image: png }) }), {
    launch: {
      commandId: "uuid-1",
      threadId: "uuid-2",
      projectId: "project-1",
      title: "Feedback: Header overlaps the logo",
      modelSelection: fallbackModelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      workspaceStrategy: {
        type: "worktree",
        baseRef: "main",
        branch: "feedback/header-overlaps-the-logo-a1b2",
        startFromOrigin: true,
      },
      initialMessage: {
        messageId: "uuid-3",
        text: `${preamble(", screenshot attached")}\n\nHeader overlaps the logo\nOnly on mobile.`,
        attachments: [],
      },
    },
    uploads: [
      { type: "image", name: "screenshot.png", mimeType: "image/png", sizeBytes: 3, dataUrl: "data:image/png;base64,AQID" },
    ],
  });
});

test("omits the screenshot mention and upload when there is no image", () => {
  const { launch, uploads } = build();
  assert.equal(launch.initialMessage.text, `${preamble("")}\n\nHeader overlaps the logo\nOnly on mobile.`);
  assert.deepEqual(uploads, []);
});

test("does not ask T3 Code to generate a title, so the Feedback title stays", () => {
  const { launch } = build();
  assert.equal("generateTitle" in launch, false);
  assert.equal("titleSeed" in launch, false);
});

test("names JPEG uploads with a matching extension", () => {
  const { uploads } = build({ feedback: feedback({ image: { mimeType: "image/jpeg", bytes: Buffer.from([255]) } }) });
  assert.equal(uploads[0].name, "screenshot.jpg");
  assert.equal(uploads[0].dataUrl, "data:image/jpeg;base64,/w==");
});

test("appends the staleness note and starts from the local branch when the fetch failed", () => {
  const { launch } = build({
    branch: { baseBranch: "develop", startFromOrigin: false, stalenessNote: "Note: the base may be stale." },
  });
  assert.ok(launch.initialMessage.text.endsWith("Only on mobile.\n\nNote: the base may be stale."));
  assert.equal(launch.workspaceStrategy.startFromOrigin, false);
  assert.equal(launch.workspaceStrategy.baseRef, "develop");
});

test("uses the Project's default model when it has one", () => {
  const projectDefault = { instanceId: "codex", model: "gpt-5", options: [{ id: "reasoningEffort", value: "high" }] };
  const { launch } = build({ project: { ...project, defaultModelSelection: projectDefault } });
  assert.deepEqual(launch.modelSelection, projectDefault);
});

test("falls back to the configured model when the Project has no default", () => {
  assert.deepEqual(build().launch.modelSelection, fallbackModelSelection);
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

test("always launches into a fresh worktree on a feedback/ branch", () => {
  const { workspaceStrategy } = build().launch;
  assert.equal(workspaceStrategy.type, "worktree");
  assert.match(workspaceStrategy.branch, /^feedback\//);
});
