import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Holder } from "@_unit/unit/Class/Holder/index";
import type { System } from "@_unit/unit/system";

import { ID_CYNTRA_KERNEL_EVENTS_STREAM } from "../ids";

type KernelEvent = {
  type: string;
  timestamp?: string | null;
  issueId?: string | null;
  workcellId?: string | null;
  data: unknown;
  durationMs?: number | null;
  tokensUsed?: number | null;
  costUsd?: number | null;
};

type KernelEventsPayload = {
  projectRoot: string;
  events: KernelEvent[];
  offset: number;
};

type I = {
  projectRoot: string;
  close: unknown;
};

type O = {
  event: KernelEvent;
  offset: number;
};

export class CyntraKernelEventsStreamUnit extends Holder<I, O> {
  private projectRoot: string | null = null;
  private unlisten: (() => void) | null = null;

  constructor(system: System) {
    super(
      {
        fi: ["projectRoot"],
        fo: [],
        i: [],
        o: ["event", "offset"],
      },
      {},
      system,
      ID_CYNTRA_KERNEL_EVENTS_STREAM,
      "close"
    );
  }

  async f({ projectRoot }: I): Promise<void> {
    this.projectRoot = projectRoot;

    await invoke("start_event_watcher", {
      params: { projectRoot },
    });

    const unlisten = await listen<KernelEventsPayload>("kernel_events", (evt) => {
      const payload = evt.payload;
      if (!payload || payload.projectRoot !== projectRoot) return;

      this._output.offset?.push(payload.offset);
      for (const event of payload.events ?? []) {
        this._output.event?.push(event);
      }
    });
    this.unlisten = unlisten;
  }

  d(): void {
    const projectRoot = this.projectRoot;
    this.projectRoot = null;

    try {
      this.unlisten?.();
    } catch {
      // ignore
    }
    this.unlisten = null;

    if (projectRoot) {
      void invoke("stop_event_watcher", { params: { projectRoot } });
    }
  }
}
