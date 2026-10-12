// ADR-0001: a Project is identified by its GitHub slug, read from the `origin`
// remote of each T3 Code project's workspace root.

export function slugFromRemote(remoteUrl) {
  const path = remoteUrl
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+\//i, "")
    .replace(/^[^/:]+:/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return parts.slice(-2).join("/").toLowerCase();
}

export async function resolveProject(slug, projects, readRemote) {
  const wanted = slug.trim().replace(/\.git$/i, "").toLowerCase();
  const remotes = await Promise.all(
    projects.map((project) => readRemote(project.workspaceRoot).catch(() => null)),
  );
  const index = remotes.findIndex((remote) => remote && slugFromRemote(remote) === wanted);
  return index === -1 ? null : projects[index];
}
