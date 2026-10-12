import { execFile } from "node:child_process";

export function git(args, { cwd, signal } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, signal, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

export async function readOriginRemote(workspaceRoot) {
  return (await git(["remote", "get-url", "origin"], { cwd: workspaceRoot })).trim();
}
