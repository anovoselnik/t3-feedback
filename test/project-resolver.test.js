import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveProject, slugFromRemote } from "../receiver/project-resolver.js";

const projects = [
  { id: "p-theme", workspaceRoot: "/work/theme" },
  { id: "p-shop", workspaceRoot: "/work/shop" },
  { id: "p-scratch", workspaceRoot: "/work/scratch" },
  { id: "p-api", workspaceRoot: "/work/api" },
];

const remotes = {
  "/work/theme": "git@github.com:anovoselnik/cajanka-theme.git",
  "/work/shop": "https://github.com/acme/Shop",
  "/work/api": "ssh://git@github.com/acme/api.git/",
};

const readRemote = async (root) => {
  if (!(root in remotes)) throw new Error("No such remote 'origin'");
  return remotes[root];
};

test("matches an SSH remote with a .git suffix", async () => {
  assert.equal((await resolveProject("anovoselnik/cajanka-theme", projects, readRemote)).id, "p-theme");
});

test("matches an HTTPS remote without a .git suffix, ignoring case", async () => {
  assert.equal((await resolveProject("acme/shop", projects, readRemote)).id, "p-shop");
});

test("matches an ssh:// remote with a trailing slash", async () => {
  assert.equal((await resolveProject("acme/api", projects, readRemote)).id, "p-api");
});

test("accepts a slug written with a .git suffix", async () => {
  assert.equal((await resolveProject("acme/api.git", projects, readRemote)).id, "p-api");
});

test("returns null when no project has a matching origin", async () => {
  assert.equal(await resolveProject("acme/missing", projects, readRemote), null);
});

test("does not match on the repository name alone", async () => {
  assert.equal(await resolveProject("someone-else/shop", projects, readRemote), null);
});

test("returns null when there are no projects", async () => {
  assert.equal(await resolveProject("acme/shop", [], readRemote), null);
});

test("reads slugs from the remote URL forms git accepts", () => {
  assert.equal(slugFromRemote("git@github.com:Owner/Name.git"), "owner/name");
  assert.equal(slugFromRemote("git@github-work:owner/name.git"), "owner/name");
  assert.equal(slugFromRemote("https://github.com/owner/name.git"), "owner/name");
  assert.equal(slugFromRemote("https://user@github.com/owner/name"), "owner/name");
  assert.equal(slugFromRemote("ssh://git@github.com:22/owner/name.git"), "owner/name");
  assert.equal(slugFromRemote("name"), null);
});
