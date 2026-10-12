import { buildDispatch } from "./dispatch-builder.js";
import { ReceiverError } from "./errors.js";
import { prepareBranch } from "./branch-preparer.js";
import { resolveProject } from "./project-resolver.js";

export function createReceiver({ config, t3, git, readRemote }) {
  return {
    async health() {
      return { machine: config.machine, t3Reachable: await t3.reachable() };
    },

    async submit(feedback) {
      const projects = await asBadGateway(t3.listProjects());
      const project = await resolveProject(feedback.project, projects, readRemote);
      if (!project) {
        throw new ReceiverError(404, `No T3 Code project for ${feedback.project} on ${config.machine}. Add it there first.`);
      }
      const branch = await prepareBranch(project.workspaceRoot, git);
      const command = buildDispatch({
        feedback,
        project,
        branch,
        fallbackModelSelection: config.fallbackModelSelection,
      });
      const environmentId = await asBadGateway(t3.environmentId());
      await asBadGateway(t3.dispatch(command));
      return {
        threadId: command.threadId,
        threadUrl: `${config.webUiBaseUrl.replace(/\/+$/, "")}/${environmentId}/${command.threadId}`,
      };
    },
  };
}

async function asBadGateway(promise) {
  try {
    return await promise;
  } catch (error) {
    throw new ReceiverError(502, error.message);
  }
}
