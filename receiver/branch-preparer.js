import { ReceiverError } from "./errors.js";

export async function prepareBranch(workspaceRoot, git, { fetchTimeoutMs = 10_000 } = {}) {
  let baseBranch;
  try {
    const ref = await git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { cwd: workspaceRoot });
    baseBranch = ref.trim().replace(/^origin\//, "");
  } catch {
    baseBranch = "";
  }
  if (!baseBranch) {
    throw new ReceiverError(
      409,
      `${workspaceRoot} has no origin/HEAD, so its default branch is unknown. Run "git remote set-head origin --auto" there.`,
    );
  }

  if (await fetchWithin(git, workspaceRoot, baseBranch, fetchTimeoutMs)) {
    return { baseBranch, startFromOrigin: true, stalenessNote: null };
  }
  return {
    baseBranch,
    startFromOrigin: false,
    stalenessNote: `Note: fetching \`${baseBranch}\` from origin failed, so this worktree starts from the local \`${baseBranch}\` branch, which may be behind origin and behind what staging runs.`,
  };
}

async function fetchWithin(git, cwd, branch, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, timeoutMs);
  });
  const fetched = git(["fetch", "origin", branch], { cwd, signal: controller.signal }).then(
    () => true,
    () => false,
  );
  try {
    return await Promise.race([fetched, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
