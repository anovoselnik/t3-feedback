import assert from "node:assert/strict";
import { test } from "node:test";

import { prepareBranch } from "../receiver/branch-preparer.js";

function fakeGit({ originHead = "origin/main\n", fetch = async () => "" } = {}) {
  const calls = [];
  const git = async (args, options) => {
    calls.push({ args, cwd: options.cwd });
    if (args[0] === "symbolic-ref") {
      if (originHead === null) throw new Error("fatal: ref refs/remotes/origin/HEAD is not a symbolic ref");
      return originHead;
    }
    if (args[0] === "fetch") return fetch(options);
    throw new Error(`unexpected git ${args.join(" ")}`);
  };
  return { git, calls };
}

test("starts from origin when the fetch succeeds", async () => {
  const { git, calls } = fakeGit({ originHead: "origin/trunk\n" });
  assert.deepEqual(await prepareBranch("/work/site", git), {
    baseBranch: "trunk",
    startFromOrigin: true,
    stalenessNote: null,
  });
  assert.deepEqual(calls.at(-1), { args: ["fetch", "origin", "trunk"], cwd: "/work/site" });
});

test("starts from the local branch with a staleness note when the fetch fails", async () => {
  const { git } = fakeGit({
    fetch: async () => {
      throw new Error("Could not resolve host: github.com");
    },
  });
  const branch = await prepareBranch("/work/site", git);
  assert.equal(branch.baseBranch, "main");
  assert.equal(branch.startFromOrigin, false);
  assert.match(branch.stalenessNote, /fetching `main` from origin failed/);
  assert.match(branch.stalenessNote, /may be behind origin/);
});

test("gives up on a fetch that outlasts the timeout and aborts it", async () => {
  let signal;
  const { git } = fakeGit({
    fetch: (options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  });
  const started = Date.now();
  const branch = await prepareBranch("/work/site", git, { fetchTimeoutMs: 30 });
  assert.equal(branch.startFromOrigin, false);
  assert.ok(branch.stalenessNote);
  assert.ok(Date.now() - started < 1000);
  assert.equal(signal.aborted, true);
});

test("rejects a Project whose origin/HEAD is missing, naming the fix", async () => {
  const { git, calls } = fakeGit({ originHead: null });
  await assert.rejects(prepareBranch("/work/site", git), (error) => {
    assert.equal(error.status, 409);
    assert.match(error.message, /\/work\/site has no origin\/HEAD/);
    assert.match(error.message, /git remote set-head origin --auto/);
    return true;
  });
  assert.equal(calls.some((call) => call.args[0] === "fetch"), false);
});
