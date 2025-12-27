/**
 * Immersa postMessage bridge
 * Handles bi-directional communication between React app and Immersa iframe
 */

import type React from "react";
import type { ImmersaAsset } from "@/types";
import type {
  ImmersaMessage,
  ImmersaLoadAssetsPayload,
  ImmersaLoadPresentationPayload,
} from "./types";

type MessageHandler = (message: ImmersaMessage) => void;

/**
 * Creates a bridge instance for communicating with an Immersa iframe
 */
export function createImmersaBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  onMessage: MessageHandler
) {
  let isReady = false;

  // Handle incoming messages from Immersa
  function handleMessage(event: MessageEvent) {
    // Validate origin in production
    const iframe = iframeRef.current;
    if (!iframe) return;

    // Parse message
    const data = event.data as ImmersaMessage;
    if (!data || typeof data.type !== "string") return;

    // Handle ready message
    if (data.type === "ready") {
      isReady = true;
    }

    // Forward to handler
    onMessage(data);
  }

  // Start listening
  function start() {
    window.addEventListener("message", handleMessage);
  }

  // Stop listening
  function stop() {
    window.removeEventListener("message", handleMessage);
    isReady = false;
  }

  // Send message to Immersa
  function send(type: ImmersaMessage["type"], payload?: unknown) {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    iframe.contentWindow.postMessage({ type, payload }, "*");
  }

  // Send assets to Immersa
  function sendAssets(assets: ImmersaAsset[]) {
    const payload: ImmersaLoadAssetsPayload = { assets };
    send("load_assets", payload);
  }

  // Send presentation data to Immersa
  function sendPresentation(id: string, data: unknown) {
    const payload: ImmersaLoadPresentationPayload = { id, data };
    send("load_presentation", payload);
  }

  // Notify Immersa of project change
  function notifyProjectChanged() {
    send("project_changed", {});
  }

  return {
    start,
    stop,
    send,
    sendAssets,
    sendPresentation,
    notifyProjectChanged,
    isReady: () => isReady,
  };
}

export type ImmersaBridge = ReturnType<typeof createImmersaBridge>;
