import { buildLaunch } from "./dispatch-builder.js";
import { ReceiverError } from "./errors.js";
import { prepareBranch } from "./branch-preparer.js";
import { resolveProject } from "./project-resolver.js";
import { ORCHESTRATION_PROTOCOL } from "./t3-client.js";

export function createReceiver({ config, t3, git, readRemote }) {
  return {
    async health() {
      try {
        const protocol = (await t3.environment()).orchestrationProtocolVersion ?? null;
        return { machine: config.machine, t3Reachable: true, t3Protocol: protocol, t3Compatible: protocol === ORCHESTRATION_PROTOCOL };
      } catch {
        return { machine: config.machine, t3Reachable: false, t3Protocol: null, t3Compatible: false };
      }
    },

    async submit(feedback) {
      const { environmentId, orchestrationProtocolVersion } = await asBadGateway(t3.environment());
      if (orchestrationProtocolVersion !== ORCHESTRATION_PROTOCOL) {
        throw new ReceiverError(502, protocolMismatch(orchestrationProtocolVersion, config.machine));
      }
      const projects = await asBadGateway(t3.listProjects());
      const project = await resolveProject(feedback.project, projects, readRemote);
      if (!project) {
        throw new ReceiverError(404, `No T3 Code project for ${feedback.project} on ${config.machine}. Add it there first.`);
      }
      const branch = await prepareBranch(project.workspaceRoot, git);
      const { launch, uploads } = buildLaunch({
        feedback,
        project,
        branch,
        fallbackModelSelection: config.fallbackModelSelection,
      });
      await asBadGateway(t3.launchThread(launch, uploads));
      return {
        threadId: launch.threadId,
        threadUrl: `${config.webUiBaseUrl.replace(/\/+$/, "")}/${environmentId}/${launch.threadId}`,
        // Opens the Thread in the T3 Code desktop app, which handles these links from v0.0.46.
        appUrl: `t3code://threads/${encodeURIComponent(environmentId)}/${encodeURIComponent(launch.threadId)}`,
      };
    },
  };
}

export function protocolMismatch(protocol, machine) {
  const outdated = protocol === undefined || protocol < ORCHESTRATION_PROTOCOL ? "T3 Code" : "the Receiver";
  return (
    `T3 Code on ${machine} speaks orchestration protocol ${protocol ?? "unknown"}, but this Receiver speaks ` +
    `${ORCHESTRATION_PROTOCOL}. Update ${outdated} on ${machine}.`
  );
}

async function asBadGateway(promise) {
  try {
    return await promise;
  } catch (error) {
    throw new ReceiverError(502, error.message);
  }
}
