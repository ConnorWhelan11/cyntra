import { ID_CYNTRA_KERNEL_EVENTS_STREAM, ID_CYNTRA_KERNEL_SNAPSHOT } from "../unitPack/ids";

const ID_CONSOLE_LOG = "e7232263-a2cf-4f2b-a862-4fc85933d09f";

export function createKernelConsoleSampleBundle(projectRoot: string) {
  const projectRootData = JSON.stringify(projectRoot);

  return {
    spec: {
      name: "Kernel Console Sample",
      units: {
        snapshot: {
          id: ID_CYNTRA_KERNEL_SNAPSHOT,
          input: {
            projectRoot: { constant: true, data: projectRootData },
            limitEvents: { constant: true, data: "200" },
          },
        },
        logSnapshot: {
          id: ID_CONSOLE_LOG,
        },
        events: {
          id: ID_CYNTRA_KERNEL_EVENTS_STREAM,
          input: {
            projectRoot: { constant: true, data: projectRootData },
          },
        },
        logEvent: {
          id: ID_CONSOLE_LOG,
        },
      },
      merges: {
        0: {
          snapshot: { output: { snapshot: true } },
          logSnapshot: { input: { message: true } },
        },
        1: {
          events: { output: { event: true } },
          logEvent: { input: { message: true } },
        },
      },
      metadata: {
        description: "Logs the kernel snapshot once, then streams kernel events to the console.",
      },
    },
  };
}
