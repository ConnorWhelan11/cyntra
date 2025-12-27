import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

type PocPingPayload = {
  nonce: string;
  sent_at: number;
};

async function initViewportPocBridge() {
  try {
    const label = getCurrentWebviewWindow().label;
    if (label !== "viewport_poc") return;

    await listen<PocPingPayload>("poc:ping", async (event) => {
      const ping = event.payload;
      await invoke("poc_pong", {
        params: {
          nonce: ping.nonce,
          sent_at: ping.sent_at,
          received_at: Date.now(),
        },
      });
    });
  } catch {
    // Best-effort: this bridge is dev-only and should never crash the UI.
  }
}

void initViewportPocBridge();
