import {
  ID_CYNTRA_BEADS_UPDATE_ISSUE,
  ID_CYNTRA_KERNEL_EVENTS_STREAM,
  ID_CYNTRA_KERNEL_SNAPSHOT,
} from "./ids";

export const CYNTRA_UNIT_SPECS: Record<string, unknown> = {
  [ID_CYNTRA_KERNEL_SNAPSHOT]: {
    name: "kernel snapshot",
    inputs: {
      projectRoot: { type: "string" },
      limitEvents: { type: "number" },
      tick: { type: "any", defaultIgnored: true },
      close: { type: "any", defaultIgnored: true },
    },
    outputs: {
      snapshot: { type: "any" },
    },
    metadata: {
      icon: "server",
      description: "fetch a Cyntra kernel snapshot for projectRoot",
      tags: ["cyntra", "kernel"],
    },
    id: ID_CYNTRA_KERNEL_SNAPSHOT,
    base: true,
    type: "`U`",
  },

  [ID_CYNTRA_KERNEL_EVENTS_STREAM]: {
    name: "kernel events stream",
    inputs: {
      projectRoot: { type: "string" },
      close: { type: "any", defaultIgnored: true },
    },
    outputs: {
      event: { type: "any" },
      offset: { type: "number", defaultIgnored: true },
    },
    metadata: {
      icon: "stream",
      description: "stream events from .cyntra/logs/events.jsonl for projectRoot",
      tags: ["cyntra", "kernel", "events"],
    },
    id: ID_CYNTRA_KERNEL_EVENTS_STREAM,
    base: true,
    type: "`U`",
  },

  [ID_CYNTRA_BEADS_UPDATE_ISSUE]: {
    name: "beads update issue",
    inputs: {
      projectRoot: { type: "string" },
      issueId: { type: "string" },
      patch: { type: "object" },
    },
    outputs: {
      issue: { type: "object" },
    },
    metadata: {
      icon: "edit",
      description: "apply a BeadsIssuePatch to an issue",
      tags: ["cyntra", "beads"],
    },
    id: ID_CYNTRA_BEADS_UPDATE_ISSUE,
    base: true,
    type: "`U`",
  },
};
