import { invoke } from "@tauri-apps/api/core";
import { Holder } from "@_unit/unit/Class/Holder/index";
import type { System } from "@_unit/unit/system";

import { ID_CYNTRA_KERNEL_SNAPSHOT } from "../ids";

type I = {
  projectRoot: string;
  limitEvents: number;
  tick: unknown;
  close: unknown;
};

type O = {
  snapshot: unknown;
};

export class CyntraKernelSnapshotUnit extends Holder<I, O> {
  private projectRoot: string | null = null;
  private limitEvents: number | null = null;

  constructor(system: System) {
    super(
      {
        fi: ["projectRoot", "limitEvents"],
        fo: [],
        i: ["tick"],
        o: ["snapshot"],
      },
      {},
      system,
      ID_CYNTRA_KERNEL_SNAPSHOT,
      "close"
    );
  }

  async f({ projectRoot, limitEvents }: I): Promise<void> {
    this.projectRoot = projectRoot;
    this.limitEvents = limitEvents;
    await this.emitSnapshot();
  }

  d(): void {
    // No-op (no background resources)
  }

  public onIterDataInputData(name: keyof I, _data: unknown): void {
    if (name === "tick") {
      void this.emitSnapshot();
      return;
    }
    super.onIterDataInputData(name, _data);
  }

  private async emitSnapshot(): Promise<void> {
    const projectRoot = this.projectRoot;
    if (!projectRoot) return;

    const limitEvents = this.limitEvents ?? 200;
    try {
      const snapshot = await invoke("kernel_snapshot", {
        params: { projectRoot, limitEvents },
      });
      this._output.snapshot?.push(snapshot);
    } catch (e) {
      // Surface error through Unit's error channel.
      this.err(String(e));
    }
  }
}
