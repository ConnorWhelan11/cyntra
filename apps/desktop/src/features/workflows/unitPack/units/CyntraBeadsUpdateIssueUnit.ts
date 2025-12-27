import { invoke } from "@tauri-apps/api/core";
import { Functional } from "@_unit/unit/Class/Functional/index";
import type { System } from "@_unit/unit/system";

import { ID_CYNTRA_BEADS_UPDATE_ISSUE } from "../ids";

type I = {
  projectRoot: string;
  issueId: string;
  patch: Record<string, unknown>;
};

type O = {
  issue: unknown;
};

export class CyntraBeadsUpdateIssueUnit extends Functional<I, O> {
  constructor(system: System) {
    super(
      {
        i: ["projectRoot", "issueId", "patch"],
        o: ["issue"],
      },
      {},
      system,
      ID_CYNTRA_BEADS_UPDATE_ISSUE
    );
  }

  async f({ projectRoot, issueId, patch }: I, done: (o: O) => void, fail: (e: string) => void) {
    try {
      const updated = await invoke("beads_update_issue", {
        params: {
          projectRoot,
          issueId,
          ...(patch ?? {}),
        },
      });
      done({ issue: updated });
    } catch (e) {
      fail(String(e));
    }
  }
}
